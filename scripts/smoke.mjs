// Prueba de humo multiplataforma: arranca el servidor ya compilado SIN Docker y comprueba
// que responde, que protege Host/Origin y que da un error de conexión legible.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "4466"; // distinto del 4455 para no chocar con un servicio ya instalado
const BASE = `http://127.0.0.1:${PORT}`;
const bogus = process.platform === "win32" ? "//./pipe/docker_gestor_no_existe" : "/tmp/docker-gestor-no-existe.sock";
const srv = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT, DOCKER_SOCKET: bogus, DATA_DIR: process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? "." }, stdio: ["ignore", "pipe", "inherit"] });
let out = ""; srv.stdout.on("data", (d) => (out += d));

const fails = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await sleep(500); } }
  check(up, "el servidor arranca y sirve la página");

  const page = await (await fetch(BASE)).text();
  check(page.includes("Docker Gestor"), "la página contiene la interfaz");

  const api = await fetch(`${BASE}/api/containers`);
  const body = await api.json().catch(() => ({}));
  check(api.status === 503 && /Docker/.test(body.error ?? ""), `sin Docker responde 503 con mensaje legible (${api.status}: ${body.error ?? "?"})`);

  const evil = await fetch(`${BASE}/api/containers`, { headers: { origin: "http://evil.example" } });
  check(evil.status === 403, `rechaza un Origin ajeno (${evil.status})`);

  check(/Docker: /.test(out), "el arranque informa del endpoint de Docker");
} finally {
  srv.kill();
}
if (fails.length) { console.error(`\n${fails.length} comprobación(es) fallida(s)`); process.exit(1); }
console.log("\nTodo correcto");
