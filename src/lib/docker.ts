import Docker from "dockerode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, detected } from "./socket.mjs";

const endpoint = detected();
export const docker = new Docker(endpoint.options);
export const run = promisify(execFile);

const PORT = process.env.PORT ?? "4455";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

/** Guards against CSRF / DNS rebinding: controlling Docker is equivalent to being root. */
export function guard(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  if (!ALLOWED_HOSTS.has(host)) return json({ error: "Host not allowed" }, 403);
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_HOSTS.has(new URL(origin).host)) return json({ error: "Origin not allowed" }, 403);
  return null;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

/** Connection errors → actionable message plus a `code` the UI translates; anything else → 500 with the original message. */
export function fail(e: unknown) {
  const code = (e as NodeJS.ErrnoException)?.code;
  const where = `${describe(endpoint.options)} (${endpoint.source})`;
  if (code === "EACCES" || code === "EPERM")
    return json({ error: `Docker: permission denied at ${where}. On Linux, add your user to the docker group and log in again.`, code: "docker_denied", where }, 503);
  if (code === "ENOENT" || code === "ECONNREFUSED")
    return json({ error: `Cannot connect to Docker at ${where}. Is it running? If it uses another path, set DOCKER_SOCKET or DOCKER_HOST.`, code: "docker_unreachable", where }, 503);
  return json({ error: e instanceof Error ? e.message : String(e) }, 500);
}

export type Snap = { id: string; name: string; cpu: number; mem: number; limit: number };

/** CPU (%) and RAM of a running container. */
export async function snapshot(c: { Id: string; Names: string[] }): Promise<Snap> {
  const s = await docker.getContainer(c.Id).stats({ stream: false });
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  const cpu = sysDelta > 0 ? (cpuDelta / sysDelta) * (s.cpu_stats.online_cpus ?? 1) * 100 : 0;
  const cache = s.memory_stats.stats?.inactive_file ?? s.memory_stats.stats?.cache ?? 0;
  return { id: c.Id, name: c.Names[0]?.replace(/^\//, ""), cpu, mem: (s.memory_stats.usage ?? 0) - cache, limit: s.memory_stats.limit ?? 0 };
}
