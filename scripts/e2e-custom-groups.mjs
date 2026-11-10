// End-to-end check of custom container groups: assign, rename/merge, dissolve, persistence across a restart,
// validation, limits, access control, and the guarantee that groups never touch the containers themselves.
//   npm run build && npm run e2e:custom-groups
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4491, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-cgroups-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-cgroups-${process.pid}` : join(tmp, "mock.sock");
const procs = []; process.on("exit", () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

const start = async () => {
  const p = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) return p; } catch {} await sleep(500); }
  return p;
};
procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
let server = await start(); procs.push(server);

const get = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const put = (b, init = {}) => get("/api/groups", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b), ...init });
const read = async () => (await get("/api/groups")).body;
const members = (r, g) => Object.entries(r.assignments).filter(([, x]) => x === g).map(([n]) => n).sort();

const empty = await read();
check(JSON.stringify(empty) === '{"assignments":{},"groups":[]}', "there are no custom groups at first");

let r = (await put({ names: ["shop-web", "shop-api"], group: "Frontend" })).body;
check(JSON.stringify(members(r, "Frontend")) === '["shop-api","shop-web"]' && r.groups[0].count === 2, "containers can be assigned to a new group");
r = (await put({ names: ["grafana"], group: "  frontend " })).body;
check(members(r, "Frontend").length === 3 && r.groups.length === 1, "group names are case-insensitive: 'frontend' joins 'Frontend' and keeps its spelling");
r = (await put({ names: ["shop-db", "shop-cache"], group: "Data" })).body;
check(r.groups.length === 2 && members(r, "Data").length === 2, "a second group coexists");
r = (await put({ names: ["shop-web"], group: "Data" })).body;
check(members(r, "Data").includes("shop-web") && !members(r, "Frontend").includes("shop-web"), "moving a container to another group removes it from the first (one group each)");

// rename and merge
r = (await put({ rename: { from: "data", to: "Storage" } })).body;
check(members(r, "Storage").length === 3 && !r.groups.some((g) => g.name === "Data"), "renaming moves every member (looked up case-insensitively)");
r = (await put({ rename: { from: "Storage", to: "frontend" } })).body;
check(r.groups.length === 1 && members(r, "Frontend").length === 5, "renaming into an existing group merges them");
check((await put({ rename: { from: "Nope", to: "X" } })).status === 404, "renaming a group that does not exist is a 404");

// persistence
await put({ names: ["mailpit"], group: "Tools" });
const before = JSON.stringify(await read());
server.kill(); await sleep(800); server = await start(); procs.push(server);
check(JSON.stringify(await read()) === before && members(await read(), "Tools")[0] === "mailpit", "groups survive a server restart");

// groups never touch containers
const snapshot = async () => JSON.stringify((await get("/api/containers")).body.map((c) => [c.name, c.state]).sort());
const containers0 = await snapshot();
await put({ dissolve: "Frontend" });
r = await read();
check(members(r, "Frontend").length === 0 && !r.groups.some((g) => g.name === "Frontend") && members(r, "Tools").length === 1, "dissolving a group frees its members and leaves other groups alone");
check(await snapshot() === containers0, "and no container was started, stopped or removed by any of it");
await put({ names: ["mailpit"], group: null });
check(Object.keys((await read()).assignments).length === 0, "removing containers from their group empties it");

// validation and limits
const code = async (b) => { const x = await put(b); return [x.status, x.body.code]; };
check((await code({ names: ["a"], group: "" }))[0] === 400 && (await code({ names: ["a"], group: "x".repeat(41) }))[0] === 400 && (await code({ names: ["a"], group: "bad\u0007name" }))[0] === 400, "invalid group names are rejected");
check((await code({ names: ["../etc"], group: "x" }))[0] === 400 && (await code({ names: [], group: "x" }))[0] === 400 && (await code({}))[0] === 400, "invalid container names and empty or ambiguous requests are rejected");
check((await code({ names: ["a"], group: "x", dissolve: "x" }))[0] === 400, "only one operation per request");
for (let i = 0; i < 50; i++) await put({ names: ["c" + i], group: "g" + i });
const over = await code({ names: ["extra"], group: "one-too-many" });
check(over[0] === 400 && over[1] === "too_many_groups", "there is a limit of 50 groups");
check((await put({ names: ["extra"], group: "G7" })).status === 200, "but joining an existing group is still allowed at the limit");

// access control
const evil = { headers: { "content-type": "application/json", origin: "http://evil.example" } };
check((await get("/api/groups", { headers: { origin: "http://evil.example" } })).status === 403 && (await put({ dissolve: "g1" }, evil)).status === 403 && members(await read(), "g1").length === 1, "a foreign Origin can neither read nor change groups");

console.log(fails ? `\n${fails} check(s) failed` : "\nAll good"); process.exit(fails ? 1 : 0);
