// Cross-platform smoke test: boots the built server WITHOUT Docker and checks that it responds,
// enforces Host/Origin and returns a readable connection error.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "4466"; // differs from 4455 so it never collides with an installed service
const BASE = `http://127.0.0.1:${PORT}`;
const bogus = process.platform === "win32" ? "//./pipe/docker_gestor_missing" : "/tmp/docker-gestor-missing.sock";
const srv = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT, DOCKER_SOCKET: bogus, DATA_DIR: process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? "." }, stdio: ["ignore", "pipe", "inherit"] });
let out = ""; srv.stdout.on("data", (d) => (out += d));

const fails = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await sleep(500); } }
  check(up, "the server boots and serves the page");

  const page = await (await fetch(BASE)).text();
  check(page.includes("Docker Gestor"), "the page contains the UI");

  const api = await fetch(`${BASE}/api/containers`);
  const body = await api.json().catch(() => ({}));
  check(api.status === 503 && body.code === "docker_unreachable" && /Docker/.test(body.error ?? ""), `without Docker: 503 with a readable message and a code (${api.status}: ${body.error ?? "?"})`);

  const evil = await fetch(`${BASE}/api/containers`, { headers: { origin: "http://evil.example" } });
  check(evil.status === 403, `rejects a foreign Origin (${evil.status})`);

  check(/Docker: /.test(out), "startup reports the Docker endpoint");
} finally {
  srv.kill();
}
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\nAll good");
