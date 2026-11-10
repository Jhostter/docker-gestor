import { docker, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try {
    const list = await docker.listContainers({ all: true });
    return json(list.map((c) => ({
      id: c.Id, name: c.Names[0]?.replace(/^\//, ""), image: c.Image, state: c.State, status: c.Status,
      ports: [...new Set(c.Ports.filter((p) => p.PublicPort).map((p) => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`))],
      project: c.Labels["com.docker.compose.project"] ?? null,
    })));
  } catch (e) { return fail(e); }
}

const PORT = /^(\d{1,5}):(\d{1,5})(\/(tcp|udp))?$/;
const ENVV = /^[A-Za-z_][A-Za-z0-9_]*=.*$/;
const VOL = /^[^:\0]+:\/[^:\0]*(:ro|:rw)?$/;

/** Creates (and starts) a container. Ports are published on 127.0.0.1 only. */
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  const b = await req.json();
  const { image, name, ports = [], env = [], volumes = [], restart = "no", network } = b;
  if (typeof image !== "string" || !/^[\w./:@-]+$/.test(image)) return json({ error: "invalid image" }, 400);
  if (name && !/^[\w.-]{1,64}$/.test(name)) return json({ error: "invalid name" }, 400);
  if (!["no", "always", "unless-stopped", "on-failure"].includes(restart)) return json({ error: "invalid restart policy" }, 400);
  if (network && !/^[\w.-]{1,64}$/.test(network)) return json({ error: "invalid network" }, 400);
  if (!ports.every((p: string) => PORT.test(p))) return json({ error: "invalid port (use 8080:80)" }, 400);
  if (!env.every((e: string) => ENVV.test(e))) return json({ error: "invalid variable (use KEY=value)" }, 400);
  if (!volumes.every((v: string) => VOL.test(v))) return json({ error: "invalid volume (use source:/path)" }, 400);

  const exposed: Record<string, object> = {}, bindings: Record<string, { HostIp: string; HostPort: string }[]> = {};
  for (const p of ports as string[]) {
    const m = p.match(PORT)!; const key = `${m[2]}/${m[4] ?? "tcp"}`;
    exposed[key] = {}; (bindings[key] ??= []).push({ HostIp: "127.0.0.1", HostPort: m[1] });
  }
  const opts = {
    Image: image, name: name || undefined, Env: env, ExposedPorts: exposed,
    HostConfig: { PortBindings: bindings, Binds: volumes, RestartPolicy: { Name: restart }, NetworkMode: network || undefined },
  };
  try {
    let c;
    try { c = await docker.createContainer(opts); }
    catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
      const stream = await docker.pull(image);
      await new Promise((res, rej) => docker.modem.followProgress(stream, (er) => (er ? rej(er) : res(null))));
      c = await docker.createContainer(opts);
    }
    await c.start();
    return json({ ok: true, id: c.id });
  } catch (e) { return fail(e); }
}
