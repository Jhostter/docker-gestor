import test from "node:test";
import assert from "node:assert/strict";
import { isSecret, parseEnv, envValue, shapeInspect, maskedRaw, MASK } from "../src/lib/inspect-core.mjs";

const SECRETS = ["hunter2", "sk_live_abc123", "p4ss", "tok-xyz", "supersecret"];
const raw = {
  Id: "a".repeat(64), Name: "/api", Created: "2026-11-01T10:00:00Z", Image: "sha256:" + "b".repeat(64), Path: "node", Args: ["server.js", "--api-key=" + SECRETS[1], "--port=3000"], RestartCount: 3, Platform: "linux",
  State: { Status: "running", Running: true, OOMKilled: false, ExitCode: 0, StartedAt: "2026-11-09T10:00:00Z", FinishedAt: "0001-01-01T00:00:00Z",
    Health: { Status: "unhealthy", FailingStreak: 4, Log: Array.from({ length: 14 }, (_, i) => ({ Start: `s${i}`, End: `e${i}`, ExitCode: i === 13 ? 1 : 0, Output: i === 13 ? "x".repeat(900) : "ok" })) } },
  HostConfig: { RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 }, Privileged: false, NetworkMode: "bridge", Memory: 512e6 },
  Mounts: [{ Type: "volume", Name: "data", Source: "/var/lib/docker/volumes/data/_data", Destination: "/data", RW: true }, { Type: "bind", Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock", RW: false }],
  Config: { Hostname: "h", User: "", Image: "ghcr.io/acme/api:1", WorkingDir: "/app", Cmd: ["--token=" + SECRETS[3]], Entrypoint: ["node"], Labels: { "com.docker.compose.project": "shop" },
    Env: ["NODE_ENV=production", "DB_PASSWORD=" + SECRETS[0], "STRIPE_API_KEY=" + SECRETS[1], "DATABASE_URL=postgres://shop:" + SECRETS[2] + "@db:5432/shop", "REDIS_URL=redis://cache:6379", "NOVALUE", "MY_SECRET=" + SECRETS[4]] },
  NetworkSettings: { Ports: { "3000/tcp": [{ HostIp: "", HostPort: "3000" }], "9229/tcp": null }, Networks: { shop_default: { IPAddress: "172.20.0.3", Gateway: "172.20.0.1", MacAddress: "02:42", Aliases: ["api"] } } },
};

test("isSecret: by name and by credentials embedded in a URL", () => {
  for (const n of ["DB_PASSWORD", "api_key", "GITHUB_TOKEN", "JWT_SECRET", "AWS_ACCESS_KEY_ID", "PRIVATE_KEY", "Authorization", "SESSION_COOKIE"]) assert.equal(isSecret(n, "x"), true, n);
  for (const n of ["NODE_ENV", "PORT", "LOG_LEVEL", "TZ", "REDIS_URL"]) assert.equal(isSecret(n, n === "REDIS_URL" ? "redis://cache:6379" : "x"), false, n);
  assert.equal(isSecret("DATABASE_URL", "postgres://u:pw@db/x"), true);
  assert.equal(isSecret("DATABASE_URL", "postgres://db/x"), false, "no credentials in the URL");
});

test("isSecret: any name with 'key' (found on a real Docker: ANON_KEY, SERVICE_KEY, DB_ENC_KEY...)", () => {
  for (const n of ["ANON_KEY", "SERVICE_KEY", "DB_ENC_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ENCRYPTION_SALT"]) assert.equal(isSecret(n, "x"), true, n);
});

test("isSecret: the value gives it away even when the name does not", () => {
  const jwt = "eyJhbGciOiJub25lIn0.eyJkZW1vIjp0cnVlfQ.ZGVtby1zaWduYXR1cmU";
  assert.equal(isSecret("CLIENT_CONFIG", jwt), true, "JWT");
  assert.equal(isSecret("PAYMENTS", "sk_live_abcdefghijkl"), true, "Stripe-style prefix");
  assert.equal(isSecret("X", "ghp_" + "a".repeat(30)), true, "GitHub token");
  assert.equal(isSecret("BUILD", "0123456789abcdef0123456789abcdef"), true, "32 hex characters");
  assert.equal(isSecret("CHECKSUM", "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg"), true, "long base64-ish string");
});

test("isSecret: ordinary values are left alone (no over-masking)", () => {
  for (const [n, v] of [["PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"], ["PGDATA", "/var/lib/postgresql/data/pgdata/with/a/long/path"], ["NODE_ENV", "production"], ["TZ", "Europe/Madrid"],
    ["SERVICE_NAME", "my-long-service-name-without-digits-at-all"], ["VERSION", "1.2.3"], ["LANG", "C.UTF-8"], ["HOME", "/root"]]) assert.equal(isSecret(n, v), false, `${n}=${v}`);
});

test("parseEnv hides secret values and keeps the rest", () => {
  const e = parseEnv(raw.Config.Env);
  assert.deepEqual(e.find((x) => x.name === "NODE_ENV"), { name: "NODE_ENV", value: "production", secret: false });
  assert.deepEqual(e.find((x) => x.name === "DB_PASSWORD"), { name: "DB_PASSWORD", value: null, secret: true });
  assert.equal(e.find((x) => x.name === "DATABASE_URL").value, null);
  assert.equal(e.find((x) => x.name === "REDIS_URL").value, "redis://cache:6379");
  assert.equal(e.find((x) => x.name === "NOVALUE").value, "");
});

test("envValue returns the real value only when asked, and undefined for unknown names", () => {
  assert.equal(envValue(raw, "DB_PASSWORD"), SECRETS[0]);
  assert.equal(envValue(raw, "DATABASE_URL"), "postgres://shop:p4ss@db:5432/shop");
  assert.equal(envValue(raw, "MISSING"), undefined);
  assert.equal(envValue(raw, "DB"), undefined, "no prefix matching");
});

test("NOTHING secret appears anywhere in the shaped output, including the raw view", () => {
  const out = JSON.stringify(shapeInspect(raw));
  for (const s of SECRETS) assert.ok(!out.includes(s), `leaked: ${s}`);
  assert.ok(out.includes(MASK));
  assert.ok(out.includes("production"), "non-secret values are kept");
});

test("command arguments with secrets are masked", () => {
  const s = shapeInspect(raw);
  assert.deepEqual(s.args, ["server.js", `--api-key=${MASK}`, "--port=3000"]);
  assert.deepEqual(s.cmd, [`--token=${MASK}`]);
});

test("notable settings: docker socket is flagged as dangerous; others only when present", () => {
  assert.deepEqual(shapeInspect(raw).flags.map((f) => f.id), ["dockerSock"]);
  const r2 = structuredClone(raw); r2.Mounts = []; r2.HostConfig = { ...r2.HostConfig, Privileged: true, PidMode: "host", NetworkMode: "host", CapAdd: ["SYS_ADMIN", "NET_ADMIN"] };
  const f = shapeInspect(r2).flags;
  assert.deepEqual(f.map((x) => x.id).sort(), ["capAdd", "hostNetwork", "hostPid", "privileged"]);
  assert.equal(f.find((x) => x.id === "capAdd").detail, "SYS_ADMIN, NET_ADMIN");
  assert.equal(f.find((x) => x.id === "privileged").level, "danger");
  const r3 = structuredClone(raw); r3.Mounts = [{ Type: "bind", Source: "/", Destination: "/host", RW: false }];
  assert.deepEqual(shapeInspect(r3).flags.map((x) => [x.id, x.detail]), [["rootMount", "ro"]]);
  const quiet = structuredClone(raw); quiet.Mounts = [];
  assert.deepEqual(shapeInspect(quiet).flags, []);
});

test("health: last 10 checks, newest first, long output trimmed", () => {
  const h = shapeInspect(raw).health;
  assert.equal(h.status, "unhealthy"); assert.equal(h.failingStreak, 4);
  assert.equal(h.log.length, 10); assert.equal(h.log[0].start, "s13"); assert.equal(h.log[0].exitCode, 1);
  assert.ok(h.log[0].output.length <= 501 && h.log[0].output.endsWith("…"));
  const none = structuredClone(raw); delete none.State.Health;
  assert.equal(shapeInspect(none).health, null);
});

test("ports, mounts, networks, restart info and limits", () => {
  const s = shapeInspect(raw);
  assert.deepEqual(s.ports, [{ container: "3000/tcp", host: [{ ip: "0.0.0.0", port: "3000" }] }, { container: "9229/tcp", host: [] }]);
  assert.equal(s.mounts[0].name, "data"); assert.equal(s.mounts[1].rw, false);
  assert.deepEqual(s.networks[0], { name: "shop_default", ip: "172.20.0.3", gateway: "172.20.0.1", mac: "02:42", aliases: ["api"] });
  assert.equal(s.restartCount, 3); assert.deepEqual(s.restartPolicy, { name: "unless-stopped", max: 0 });
  assert.equal(s.limits.memory, 512e6); assert.equal(s.name, "api");
});

test("maskedRaw keeps the structure but hides secrets, and does not modify its input", () => {
  const before = JSON.stringify(raw), m = maskedRaw(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.ok(m.Config.Env.includes("NODE_ENV=production") && m.Config.Env.includes(`DB_PASSWORD=${MASK}`) && m.Config.Env.includes("NOVALUE"));
});

test("robust against sparse inspect data", () => {
  assert.doesNotThrow(() => shapeInspect({ Id: "x", Name: "/n", State: {}, Config: {}, HostConfig: {} }));
  assert.deepEqual(parseEnv(undefined), []);
});
