import Docker from "dockerode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
export const run = promisify(execFile);

const ALLOWED_HOSTS = new Set(["127.0.0.1:4455", "localhost:4455"]);

/** Protege contra CSRF / DNS rebinding: controlar Docker equivale a ser root. */
export function guard(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  if (!ALLOWED_HOSTS.has(host)) return json({ error: "Host no permitido" }, 403);
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_HOSTS.has(new URL(origin).host)) return json({ error: "Origen no permitido" }, 403);
  return null;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const fail = (e: unknown) =>
  json({ error: e instanceof Error ? e.message : String(e) }, 500);

export type Snap = { id: string; name: string; cpu: number; mem: number; limit: number };

/** CPU (%) y RAM de un contenedor en ejecución. */
export async function snapshot(c: { Id: string; Names: string[] }): Promise<Snap> {
  const s = await docker.getContainer(c.Id).stats({ stream: false });
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  const cpu = sysDelta > 0 ? (cpuDelta / sysDelta) * (s.cpu_stats.online_cpus ?? 1) * 100 : 0;
  const cache = s.memory_stats.stats?.inactive_file ?? s.memory_stats.stats?.cache ?? 0;
  return { id: c.Id, name: c.Names[0]?.replace(/^\//, ""), cpu, mem: (s.memory_stats.usage ?? 0) - cache, limit: s.memory_stats.limit ?? 0 };
}
