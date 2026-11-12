// End-to-end check of the disk usage / safe cleanup feature against the mock Docker API (no real Docker involved).
//   npm run build && npm run e2e:disk
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4498, BASE = `http://127.0.0.1:${PORT}`, tmp = mkdtempSync(join(tmpdir(), "dg-disk-"));
const sock = process.platform === "win32" ? `\\\\.\\pipe\\dg-disk-${process.pid}` : join(tmp, "mock.sock");
const procs = []; const cleanup = () => { procs.forEach((p) => p.kill()); try { rmSync(tmp, { recursive: true, force: true }); } catch {} }; process.on("exit", cleanup);
let fails = 0; const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

procs.push(spawn(process.execPath, ["scripts/demo/mock-docker.mjs", sock], { stdio: "ignore" })); await sleep(700);
procs.push(spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), DOCKER_SOCKET: sock, DATA_DIR: tmp }, stdio: "ignore" }));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

const get = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const clean = (sel, init = {}) => get("/api/disk/clean", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sel), ...init });
const names = (xs, k = "name") => xs.map((x) => x[k]).sort();

// ---- report
const r1 = await get("/api/disk?fresh=1");
const c = r1.body.candidates, s = r1.body.summary;
check(r1.status === 200 && s.total > 0 && s.reclaimable > 0 && s.reclaimable <= s.total, "the report returns totals and a reclaimable amount that never exceeds the total");
check(c.images.filter((i) => i.dangling).length === 2, "two untagged (dangling) images are found");
const unusedTagged = c.images.filter((i) => !i.dangling).flatMap((i) => i.tags);
check(unusedTagged.includes("node:22-alpine") && unusedTagged.includes("ubuntu:24.04"), "unused tagged images are listed");
check(!unusedTagged.includes("alpine:3.20") && !unusedTagged.includes("nginx:1.27-alpine"), "an image used by a container (even a stopped one) is NOT a candidate");
check(JSON.stringify(names(c.containers)) === '["old-experiment"]', "only the stopped container is a candidate");
check(JSON.stringify(names(c.volumes)) === JSON.stringify(["legacy_uploads", c.volumes.find((v) => /^[a-f0-9]{64}$/.test(v.name)).name].sort()), "only volumes with no container are candidates (not the ones in use)");
check(c.buildCache?.size === 710e6 && c.buildCache.count === 6, "build cache candidate excludes the entry in use");
const cached = await get("/api/disk");
check(cached.body.at === r1.body.at, "a second request within a few seconds reuses the cached report");

// ---- safety: a misbehaving client asks for things that are in use
const images = (await get("/api/images")).body, containers = (await get("/api/containers")).body, vols = (await get("/api/volumes")).body;
const running = containers.find((x) => x.name === "shop-api"), nginx = images.find((i) => i.tags.includes("nginx:1.27-alpine"));
const bad = await clean({ containers: [running.id], images: [nginx.id], volumes: ["shop_pgdata"] });
check(bad.status === 200 && bad.body.results.length === 3 && bad.body.results.every((x) => x.ok === false), "asking to remove a running container, an image and a volume that are in use fails for all three");
check(bad.body.results[0].error === "container is running", "the running container is refused by Docker Kong itself (before asking Docker)");
check(/used by a container/.test(bad.body.results[1].error ?? "") && /in use/.test(bad.body.results[2].error ?? ""), "Docker's refusals are reported, not hidden");
const after = { containers: (await get("/api/containers")).body, images: (await get("/api/images")).body, vols: (await get("/api/volumes")).body };
check(after.containers.some((x) => x.name === "shop-api") && after.images.some((i) => i.tags.includes("nginx:1.27-alpine")) && after.vols.some((v) => v.name === "shop_pgdata"), "nothing in use was actually removed");

// ---- validation and access control
check((await clean({})).status === 400 && (await clean({ images: ["nginx:latest"] })).status === 400 && (await clean({ volumes: ["../x"] })).status === 400, "empty or malformed selections are rejected with 400");
check((await clean({ buildCache: true }, { headers: { "content-type": "application/json", origin: "http://evil.example" } })).status === 403, "a foreign Origin cannot clean anything");
check((await get("/api/disk", { headers: { origin: "http://evil.example" } })).status === 403, "a foreign Origin cannot read the report either");

// ---- the real cleanup
const dangling = c.images.filter((i) => i.dangling).map((i) => i.id), node = c.images.find((i) => i.tags.includes("node:22-alpine")).id;
const sel = { containers: c.containers.map((x) => x.id), images: [...dangling, node], volumes: ["legacy_uploads"], buildCache: true };
const done = await clean(sel);
check(done.status === 200 && done.body.results.length === 1 + 3 + 1 + 1 && done.body.results.every((x) => x.ok), "the chosen items are all removed");
const r2 = await get("/api/disk");
const c2 = r2.body.candidates;
check(r2.body.at !== r1.body.at, "the cache is invalidated after cleaning");
check(c2.images.every((i) => !i.dangling) && !c2.images.some((i) => i.tags.includes("node:22-alpine")) && c2.buildCache === null && !c2.containers.length && !c2.volumes.some((v) => v.name === "legacy_uploads"), "they are gone from the report");
check(c2.volumes.some((v) => v.name === "old_experiment_data") && c2.images.some((i) => i.tags.includes("alpine:3.20")), "removing the container frees its volume and image for the next cleanup");
check(r2.body.summary.total < s.total, `total Docker disk usage went down (${(s.total / 1e6).toFixed(0)} MB → ${(r2.body.summary.total / 1e6).toFixed(0)} MB)`);
const again = await clean({ containers: sel.containers });
check(again.body.results[0].ok === false, "removing something that is already gone is reported as a failure, not as success");

console.log(fails ? `\n${fails} check(s) failed` : "\nAll good");
process.exit(fails ? 1 : 0);
