import test from "node:test";
import assert from "node:assert/strict";
import { detectDocker, parseHost, describe } from "../src/lib/socket.mjs";

const none = () => false;
const base = { env: {}, home: "/home/u", uid: 1000, exists: none, context: () => "" };

test("parseHost: unix, npipe, tcp and paths", () => {
  assert.deepEqual(parseHost("unix:///var/run/docker.sock"), { socketPath: "/var/run/docker.sock" });
  assert.deepEqual(parseHost("npipe:////./pipe/docker_engine"), { socketPath: "//./pipe/docker_engine" });
  assert.deepEqual(parseHost("tcp://10.0.0.5:2376"), { host: "10.0.0.5", port: 2376, protocol: "http" });
  assert.deepEqual(parseHost("/tmp/d.sock"), { socketPath: "/tmp/d.sock" });
  assert.deepEqual(parseHost("\\\\.\\pipe\\docker_engine"), { socketPath: "\\\\.\\pipe\\docker_engine" });
  assert.equal(parseHost(""), null);
  assert.equal(parseHost("basura"), null);
});

test("DOCKER_SOCKET wins over DOCKER_HOST and over auto-detection", () => {
  const r = detectDocker({ ...base, env: { DOCKER_SOCKET: "/x.sock", DOCKER_HOST: "unix:///y.sock" }, exists: () => true });
  assert.equal(r.options.socketPath, "/x.sock");
  assert.equal(detectDocker({ ...base, env: { DOCKER_HOST: "unix:///y.sock" } }).options.socketPath, "/y.sock");
});

test("Windows uses the Docker Desktop named pipe", () => {
  const r = detectDocker({ ...base, platform: "win32" });
  assert.equal(r.options.socketPath, "//./pipe/docker_engine");
});

test("Linux: the classic socket wins when it exists", () => {
  const r = detectDocker({ ...base, platform: "linux", exists: (p) => p === "/var/run/docker.sock" || p.includes(".colima") });
  assert.equal(r.options.socketPath, "/var/run/docker.sock");
});

test("macOS: broken /var/run link → Docker Desktop, otherwise Colima/Rancher/OrbStack", () => {
  const only = (path) => ({ ...base, platform: "darwin", exists: (p) => p === path });
  assert.equal(detectDocker(only("/home/u/.docker/run/docker.sock")).options.socketPath, "/home/u/.docker/run/docker.sock");
  assert.equal(detectDocker(only("/home/u/.colima/default/docker.sock")).options.socketPath, "/home/u/.colima/default/docker.sock");
  assert.equal(detectDocker(only("/home/u/.rd/docker.sock")).options.socketPath, "/home/u/.rd/docker.sock");
  assert.equal(detectDocker(only("/home/u/.orbstack/run/docker.sock")).options.socketPath, "/home/u/.orbstack/run/docker.sock");
});

test("Linux rootless: /run/user/<uid>/docker.sock", () => {
  const r = detectDocker({ ...base, platform: "linux", exists: (p) => p === "/run/user/1000/docker.sock" });
  assert.equal(r.options.socketPath, "/run/user/1000/docker.sock");
});

test("no sockets: uses docker context and, failing that, the default", () => {
  const ctx = detectDocker({ ...base, platform: "linux", context: () => "unix:///ctx.sock" });
  assert.equal(ctx.options.socketPath, "/ctx.sock");
  assert.equal(ctx.source, "docker context");
  const def = detectDocker({ ...base, platform: "linux" });
  assert.equal(def.options.socketPath, "/var/run/docker.sock");
  assert.equal(def.source, "default");
});

test("describe", () => {
  assert.equal(describe({ socketPath: "/a" }), "/a");
  assert.equal(describe({ host: "h", port: 1 }), "h:1");
});
