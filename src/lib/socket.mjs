// Docker endpoint detection for Linux, macOS and Windows.
// No dependencies and no side effects on import: `detectDocker` receives everything it reads from the environment.
import { existsSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import { posix } from "node:path"; // Unix socket paths are always POSIX, even when evaluated on Windows
import { execFileSync } from "node:child_process";

/** Turns unix://, npipe://, tcp:// or a plain path into dockerode options. */
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
 * Order: DOCKER_SOCKET → DOCKER_HOST → Windows named pipe → usual sockets
 * (Linux, Docker Desktop, Colima, Rancher Desktop, OrbStack, rootless Docker) → `docker context`.
 */
export function detectDocker({
  env = process.env, platform = osPlatform(), home = homedir(),
  uid = process.getuid?.(), exists = existsSync, context = contextHost,
} = {}) {
  const explicit = parseHost(env.DOCKER_SOCKET) ?? parseHost(env.DOCKER_HOST);
  if (explicit) return { options: explicit, source: "environment variable" };
  if (platform === "win32") return { options: { socketPath: "//./pipe/docker_engine" }, source: "Windows default" };

  const candidates = [
    "/var/run/docker.sock",
    posix.join(home, ".docker/run/docker.sock"),      // Docker Desktop (macOS/Linux)
    posix.join(home, ".colima/default/docker.sock"),  // Colima
    posix.join(home, ".rd/docker.sock"),              // Rancher Desktop
    posix.join(home, ".orbstack/run/docker.sock"),    // OrbStack
    uid != null ? `/run/user/${uid}/docker.sock` : null, // Docker rootless
  ].filter(Boolean);
  const found = candidates.find((p) => exists(p));
  if (found) return { options: { socketPath: found }, source: "auto-detected" };

  const ctx = parseHost(context());
  if (ctx) return { options: ctx, source: "docker context" };
  return { options: { socketPath: "/var/run/docker.sock" }, source: "default" };
}

/** Human-readable endpoint, for logs and error messages. */
export const describe = (o) => (o.socketPath ? o.socketPath : `${o.host}:${o.port}`);

/** Computed once per process even if Next loads the module several times. */
export function detected() {
  const g = globalThis;
  return (g.__dockerEndpoint ??= detectDocker());
}
