// Turns the raw `docker inspect` of a container into what the UI needs, with no I/O.
// Values that look secret are never included: they are fetched one by one, on demand.

// Any name containing "key" is treated as sensitive (ANON_KEY, SERVICE_KEY, DB_ENC_KEY, ...): hiding too much only costs a click.
const SECRET_NAME = /(pass(word|wd)?|pwd|secret|token|key|private|credential|auth|cert|jwt|salt|signature|dsn|session|cookie|bearer|enc(rypt)?)/i;
// The value itself can give it away even when the name does not: JWTs, well-known token prefixes, long key-like strings.
const SECRET_VALUE = /^(eyJ[\w-]+\.[\w-]+\.[\w-]*|(sk|pk|rk)_(live|test)_\w+|gh[pousr]_\w{20,}|xox[abprs]-[\w-]+|AKIA[0-9A-Z]{16}|glpat-[\w-]{16,})$/;
const looksLikeKey = (v) => /^[A-Za-z0-9+_=-]{32,}$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v);
const CRED_URL = /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i; // scheme://user:password@host
const SECRET_ARG = /^(--?[\w-]*(pass|secret|token|key|pwd)[\w-]*)=(.+)$/i;
export const MASK = "••••••";

/** Best-effort heuristic on the variable name, on credentials embedded in URLs and on how the value looks. */
export const isSecret = (name, value = "") => SECRET_NAME.test(name) || CRED_URL.test(value) || SECRET_VALUE.test(value) || looksLikeKey(value);
const maskArg = (a) => String(a).replace(SECRET_ARG, `$1=${MASK}`);
const maskEnvLine = (line) => { const i = line.indexOf("="); const n = i < 0 ? line : line.slice(0, i), v = i < 0 ? "" : line.slice(i + 1); return isSecret(n, v) ? `${n}=${MASK}` : line; };

export function parseEnv(list) {
  return (list ?? []).map((line) => {
    const i = line.indexOf("="), name = i < 0 ? line : line.slice(0, i), value = i < 0 ? "" : line.slice(i + 1);
    const secret = isSecret(name, value);
    return { name, value: secret ? null : value, secret };
  });
}
/** The real value of one variable (used by the explicit "show" action). */
export function envValue(raw, name) {
  for (const line of raw?.Config?.Env ?? []) { const i = line.indexOf("="); if ((i < 0 ? line : line.slice(0, i)) === name) return i < 0 ? "" : line.slice(i + 1); }
  return undefined;
}

const SOCKET = /(^|\/)docker\.sock$/;
function flagsOf(raw) {
  const h = raw.HostConfig ?? {}, flags = [];
  if (h.Privileged) flags.push({ id: "privileged", level: "danger" });
  if ((raw.Mounts ?? []).some((m) => SOCKET.test(m.Source ?? ""))) flags.push({ id: "dockerSock", level: "danger" });
  if ((raw.Mounts ?? []).some((m) => m.Type === "bind" && m.Source === "/")) flags.push({ id: "rootMount", level: "danger", detail: (raw.Mounts.find((m) => m.Source === "/")?.RW ? "rw" : "ro") });
  if (h.PidMode === "host") flags.push({ id: "hostPid", level: "warn" });
  if (h.NetworkMode === "host") flags.push({ id: "hostNetwork", level: "warn" });
  if ((h.CapAdd ?? []).length) flags.push({ id: "capAdd", level: "warn", detail: h.CapAdd.join(", ") });
  return flags;
}

const trim = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : (s ?? ""));

export function shapeInspect(raw) {
  const st = raw.State ?? {}, h = raw.HostConfig ?? {}, c = raw.Config ?? {}, ns = raw.NetworkSettings ?? {};
  const health = st.Health ? {
    status: st.Health.Status, failingStreak: st.Health.FailingStreak ?? 0,
    log: (st.Health.Log ?? []).slice(-10).reverse().map((l) => ({ start: l.Start, end: l.End, exitCode: l.ExitCode, output: trim(l.Output, 500) })),
  } : null;
  const ports = Object.entries(ns.Ports ?? {}).map(([port, binds]) => ({ container: port, host: (binds ?? []).map((b) => ({ ip: b.HostIp || "0.0.0.0", port: b.HostPort })) }));
  return {
    id: raw.Id, name: (raw.Name ?? "").replace(/^\//, ""), image: c.Image, imageId: raw.Image, created: raw.Created, platform: raw.Platform,
    state: { status: st.Status, running: !!st.Running, paused: !!st.Paused, restarting: !!st.Restarting, oomKilled: !!st.OOMKilled, exitCode: st.ExitCode, error: st.Error || "", startedAt: st.StartedAt, finishedAt: st.FinishedAt },
    restartCount: raw.RestartCount ?? 0, restartPolicy: { name: h.RestartPolicy?.Name || "no", max: h.RestartPolicy?.MaximumRetryCount ?? 0 },
    path: raw.Path, args: (raw.Args ?? []).map(maskArg), entrypoint: (c.Entrypoint ?? []).map(maskArg), cmd: (c.Cmd ?? []).map(maskArg),
    workingDir: c.WorkingDir || "", user: c.User || "", hostname: c.Hostname || "", tty: !!c.Tty,
    health, env: parseEnv(c.Env),
    mounts: (raw.Mounts ?? []).map((m) => ({ type: m.Type, name: m.Name ?? "", source: m.Source, destination: m.Destination, rw: m.RW !== false })),
    ports,
    networks: Object.entries(ns.Networks ?? {}).map(([name, n]) => ({ name, ip: n.IPAddress || "", gateway: n.Gateway || "", mac: n.MacAddress || "", aliases: n.Aliases ?? [] })),
    limits: { memory: h.Memory || 0, memorySwap: h.MemorySwap || 0, nanoCpus: h.NanoCpus || 0, cpuShares: h.CpuShares || 0, pids: h.PidsLimit || 0 },
    flags: flagsOf(raw), labels: c.Labels ?? {},
    raw: maskedRaw(raw),
  };
}

/** The complete inspect with every sensitive-looking value replaced, safe to display or copy. */
export function maskedRaw(raw) {
  const r = structuredClone(raw);
  if (r.Config) {
    r.Config.Env = (r.Config.Env ?? []).map(maskEnvLine);
    if (r.Config.Cmd) r.Config.Cmd = r.Config.Cmd.map(maskArg);
    if (r.Config.Entrypoint) r.Config.Entrypoint = r.Config.Entrypoint.map(maskArg);
  }
  if (r.Args) r.Args = r.Args.map(maskArg);
  if (r.State?.Health?.Log) r.State.Health.Log = r.State.Health.Log.slice(-10);
  return r;
}
