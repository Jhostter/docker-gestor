// Detección del endpoint de Docker en Linux, macOS y Windows.
// Sin dependencias y sin efectos al importar: `detectDocker` recibe todo lo que lee del entorno.
import { existsSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/** Convierte unix://, npipe://, tcp:// o una ruta en opciones de dockerode. */
export function parseHost(h) {
  if (!h) return null;
  if (h.startsWith("unix://")) return { socketPath: h.slice(7) };
  if (h.startsWith("npipe://")) return { socketPath: h.slice(8) };
  if (/^(tcp|http):\/\//.test(h)) {
    const u = new URL(h.replace(/^tcp:/, "http:"));
    return { host: u.hostname, port: Number(u.port) || 2375, protocol: "http" };
  }
  if (h.startsWith("/") || h.startsWith("\\\\")) return { socketPath: h };
  return null;
}

function contextHost() {
  try {
    return execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
      timeout: 3000, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
    }).trim();
  } catch { return ""; }
}

/**
 * Orden: DOCKER_SOCKET → DOCKER_HOST → tubería de Windows → sockets habituales
 * (Linux, Docker Desktop, Colima, Rancher Desktop, OrbStack, Docker rootless) → `docker context`.
 */
export function detectDocker({
  env = process.env, platform = osPlatform(), home = homedir(),
  uid = process.getuid?.(), exists = existsSync, context = contextHost,
} = {}) {
  const explicit = parseHost(env.DOCKER_SOCKET) ?? parseHost(env.DOCKER_HOST);
  if (explicit) return { options: explicit, source: "variable de entorno" };
  if (platform === "win32") return { options: { socketPath: "//./pipe/docker_engine" }, source: "predeterminado de Windows" };

  const candidates = [
    "/var/run/docker.sock",
    join(home, ".docker/run/docker.sock"),      // Docker Desktop (macOS/Linux)
    join(home, ".colima/default/docker.sock"),  // Colima
    join(home, ".rd/docker.sock"),              // Rancher Desktop
    join(home, ".orbstack/run/docker.sock"),    // OrbStack
    uid != null ? `/run/user/${uid}/docker.sock` : null, // Docker rootless
  ].filter(Boolean);
  const found = candidates.find((p) => exists(p));
  if (found) return { options: { socketPath: found }, source: "detectado" };

  const ctx = parseHost(context());
  if (ctx) return { options: ctx, source: "docker context" };
  return { options: { socketPath: "/var/run/docker.sock" }, source: "predeterminado" };
}

/** Texto legible del endpoint, para logs y mensajes de error. */
export const describe = (o) => (o.socketPath ? o.socketPath : `${o.host}:${o.port}`);

/** Se calcula una sola vez por proceso aunque Next cargue el módulo varias veces. */
export function detected() {
  const g = globalThis;
  return (g.__dockerEndpoint ??= detectDocker());
}
