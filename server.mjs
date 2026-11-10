// Servidor propio: Next.js + WebSocket para la terminal interactiva (docker exec).
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import Docker from "dockerode";

const HOST = "127.0.0.1", PORT = 4455;
const ALLOWED = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const dev = process.env.NODE_ENV !== "production";
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
const app = next({ dev, hostname: HOST, port: PORT });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const wss = new WebSocketServer({ noServer: true });

const server = createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws/exec") return upgrade(req, socket, head); // HMR de Next en dev
  const origin = req.headers.origin;
  const ok = ALLOWED.has(req.headers.host ?? "") && (!origin || ALLOWED.has(new URL(origin).host));
  const id = url.searchParams.get("id") ?? "";
  if (!ok || !/^[a-f0-9]{12,64}$/.test(id)) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => terminal(ws, id));
});

async function terminal(ws, id) {
  try {
    const exec = await docker.getContainer(id).exec({
      Cmd: ["/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"],
      AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
    });
    const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
    stream.on("data", (d) => ws.readyState === 1 && ws.send(d.toString("utf8")));
    stream.on("end", () => ws.close());
    ws.on("message", (m) => {
      try {
        const msg = JSON.parse(m.toString());
        if (msg.type === "input") stream.write(msg.data);
        else if (msg.type === "resize") exec.resize({ w: Math.max(1, msg.cols | 0), h: Math.max(1, msg.rows | 0) }).catch(() => {});
      } catch {}
    });
    ws.on("close", () => stream.destroy());
  } catch (e) {
    ws.send(`\r\n\x1b[31m${e.message}\x1b[0m\r\n`); ws.close();
  }
}

server.listen(PORT, HOST, () => console.log(`Docker Gestor en http://localhost:${PORT}`));
