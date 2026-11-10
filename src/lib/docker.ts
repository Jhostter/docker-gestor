import Docker from "dockerode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, detected } from "./socket.mjs";

const endpoint = detected();
export const docker = new Docker(endpoint.options);
export const run = promisify(execFile);

const PORT = process.env.PORT ?? "4455";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

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

/** Errores de conexión con Docker → mensaje accionable; el resto, 500 con el mensaje original. */
export function fail(e: unknown) {
  const code = (e as NodeJS.ErrnoException)?.code;
  const where = `${describe(endpoint.options)} (${endpoint.source})`;
  if (code === "EACCES" || code === "EPERM")
    return json({ error: `Docker: permiso denegado en ${where}. En Linux añade tu usuario al grupo docker y vuelve a iniciar sesión.` }, 503);
  if (code === "ENOENT" || code === "ECONNREFUSED")
    return json({ error: `No se puede conectar con Docker en ${where}. ¿Está en marcha? Si usa otra ruta, define DOCKER_SOCKET o DOCKER_HOST.` }, 503);
  return json({ error: e instanceof Error ? e.message : String(e) }, 500);
}

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
