import test from "node:test";
import assert from "node:assert/strict";
import { planLayers, parseDependsOn, validateBatch, BatchError, MAX_IDS, validateGroupName, validateGroupOp, canonicalGroup, MAX_GROUP_NAME, planMove, parseDependencies, dependencyRequirements, evaluateDependency, waitForDependency } from "../src/lib/groups-core.mjs";

const c = (id, service, dependsOn) => ({ id, labels: service ? { "com.docker.compose.service": service, ...(dependsOn ? { "com.docker.compose.depends_on": dependsOn } : {}) } : {} });
// web -> api -> (db, cache);  worker -> (db, cache)
const shop = [c("web", "web", "api:service_started:false"), c("api", "api", "db:service_healthy:false,cache:service_started:false"), c("db", "db"), c("cache", "cache"), c("worker", "worker", "db:service_healthy:false,cache:service_started:false")];
const norm = (layers) => layers.map((l) => [...l].sort());

test("parseDependsOn reads Compose's label format", () => {
  assert.deepEqual(parseDependsOn("db:service_healthy:false,cache:service_started:false"), ["db", "cache"]);
  assert.deepEqual(parseDependsOn(""), []);
  assert.deepEqual(parseDependsOn(undefined), []);
  assert.deepEqual(parseDependsOn(" a : x , b "), ["a", "b"]);
});

test("start: dependencies first, in layers that can run concurrently", () => {
  assert.deepEqual(norm(planLayers(shop, "start")), [["cache", "db"], ["api", "worker"], ["web"]]);
});

test("stop and remove: the exact reverse (dependents first)", () => {
  assert.deepEqual(norm(planLayers(shop, "stop")), [["web"], ["api", "worker"], ["cache", "db"]]);
  assert.deepEqual(norm(planLayers(shop, "remove")), [["web"], ["api", "worker"], ["cache", "db"]]);
});

test("restart follows the start order", () => {
  assert.deepEqual(norm(planLayers(shop, "restart")), [["cache", "db"], ["api", "worker"], ["web"]]);
});

test("containers with no Compose information are not ordered: one layer", () => {
  assert.deepEqual(norm(planLayers([c("a"), c("b"), c("c")], "start")), [["a", "b", "c"]]);
});

test("a dependency outside the selection imposes no ordering", () => {
  const sel = [c("api", "api", "db:service_healthy:false"), c("web", "web", "api:service_started:false")]; // db not selected
  assert.deepEqual(norm(planLayers(sel, "start")), [["api"], ["web"]]);
});

test("several replicas of a service are all waited for", () => {
  const sel = [c("db1", "db"), c("db2", "db"), c("api", "api", "db:service_started:false")];
  assert.deepEqual(norm(planLayers(sel, "start")), [["db1", "db2"], ["api"]]);
});

test("a dependency cycle never blocks: everything is still planned", () => {
  const sel = [c("a", "a", "b:x"), c("b", "b", "a:x"), c("free", "free")];
  const layers = planLayers(sel, "start");
  assert.deepEqual(layers.flat().sort(), ["a", "b", "free"]);
  assert.deepEqual(layers[0], ["free"]);
});

test("every container appears exactly once", () => {
  for (const a of ["start", "stop", "restart", "remove"]) assert.deepEqual(planLayers(shop, a).flat().sort(), ["api", "cache", "db", "web", "worker"]);
  assert.deepEqual(planLayers([], "start"), []);
});

test("a container that depends on itself does not deadlock", () => {
  assert.deepEqual(planLayers([c("x", "x", "x:service_started:false")], "start"), [["x"]]);
});

test("validateBatch accepts sane input and de-duplicates", () => {
  const v = validateBatch({ action: "stop", ids: ["a".repeat(64), "a".repeat(64), "b".repeat(12)] });
  assert.equal(v.action, "stop"); assert.equal(v.ids.length, 2);
});

test("validateBatch rejects anything unexpected", () => {
  const code = (b) => { try { validateBatch(b); } catch (e) { assert.ok(e instanceof BatchError); return e.code; } };
  assert.equal(code({ action: "stop", ids: [] }), "empty_batch");
  assert.equal(code({ action: "explode", ids: ["a".repeat(12)] }), "invalid_batch");
  assert.equal(code({ action: "stop", ids: ["../x"] }), "invalid_batch");
  assert.equal(code({ action: "stop", ids: "abc" }), "invalid_batch");
  assert.equal(code({ action: "stop" }), "invalid_batch");
  assert.equal(code(null), "invalid_batch");
  assert.equal(code({ action: "stop", ids: Array.from({ length: MAX_IDS + 1 }, (_, i) => i.toString(16).padStart(12, "0")) }), "invalid_batch");
  assert.equal(code({ action: "stop", ids: ["NOTHEX123456"] }), "invalid_batch");
});

const code = (f) => { try { f(); } catch (e) { assert.ok(e instanceof BatchError); return e.code; } };

test("validateGroupName trims, collapses spaces and enforces the limits", () => {
  assert.equal(validateGroupName("  My   stack  "), "My stack");
  assert.equal(validateGroupName("producción 🚀"), "producción 🚀");
  assert.equal(code(() => validateGroupName("")), "invalid_group");
  assert.equal(code(() => validateGroupName("   ")), "invalid_group");
  assert.equal(code(() => validateGroupName("x".repeat(MAX_GROUP_NAME + 1))), "invalid_group");
  assert.equal(validateGroupName("x".repeat(MAX_GROUP_NAME)).length, MAX_GROUP_NAME);
  assert.equal(validateGroupName("a\nb\tc"), "a b c", "newlines and tabs are whitespace: normalised to one space");
  assert.equal(code(() => validateGroupName("a\u0007b")), "invalid_group", "other control characters are rejected");
  assert.equal(code(() => validateGroupName("a\u0000b")), "invalid_group");
  assert.equal(code(() => validateGroupName(42)), "invalid_group");
  assert.equal(code(() => validateGroupName(null)), "invalid_group");
});

test("validateGroupOp: assign, unassign, rename and dissolve", () => {
  assert.deepEqual(validateGroupOp({ names: ["web", "web", "api-1"], group: " Frontend " }), { kind: "assign", names: ["web", "api-1"], group: "Frontend" });
  assert.deepEqual(validateGroupOp({ names: ["web"], group: null }), { kind: "assign", names: ["web"], group: null });
  assert.deepEqual(validateGroupOp({ rename: { from: "a", to: "b" } }), { kind: "rename", from: "a", to: "b" });
  assert.deepEqual(validateGroupOp({ dissolve: "a" }), { kind: "dissolve", group: "a" });
});

test("validateGroupOp rejects anything ambiguous or unexpected", () => {
  assert.equal(code(() => validateGroupOp({})), "invalid_group_op");
  assert.equal(code(() => validateGroupOp(null)), "invalid_group_op");
  assert.equal(code(() => validateGroupOp({ names: ["a"], group: "x", dissolve: "x" })), "invalid_group_op", "exactly one operation");
  assert.equal(code(() => validateGroupOp({ names: [], group: "x" })), "invalid_group_op");
  assert.equal(code(() => validateGroupOp({ names: ["../x"], group: "x" })), "invalid_group_op");
  assert.equal(code(() => validateGroupOp({ names: ["-bad"], group: "x" })), "invalid_group_op", "a container name cannot start with a dash");
  assert.equal(code(() => validateGroupOp({ names: "web", group: "x" })), "invalid_group_op");
  assert.equal(code(() => validateGroupOp({ names: Array.from({ length: MAX_IDS + 1 }, (_, i) => "c" + i), group: "x" })), "invalid_group_op");
  assert.equal(code(() => validateGroupOp({ names: ["web"], group: "" })), "invalid_group");
  assert.equal(code(() => validateGroupOp({ rename: { from: "a" } })), "invalid_group");
  assert.equal(code(() => validateGroupOp({ dissolve: 5 })), "invalid_group");
});

test("canonicalGroup: groups are case-insensitive and keep the existing spelling", () => {
  assert.equal(canonicalGroup("frontend", ["Frontend", "Data"]), "Frontend");
  assert.equal(canonicalGroup("DATA", new Set(["Frontend", "Data"])), "Data");
  assert.equal(canonicalGroup("New", ["Frontend"]), "New");
});

test("planMove: moves containers into a group and reports only what changed", () => {
  const a = { web: "Frontend", api: "Backend" };
  const r = planMove(a, ["web", "api", "db"], "Backend");
  assert.deepEqual(r.next, { web: "Backend", api: "Backend", db: "Backend" });
  assert.deepEqual(r.moved.sort(), ["db", "web"], "api was already there");
  assert.equal(r.group, "Backend");
  assert.deepEqual(a, { web: "Frontend", api: "Backend" }, "the input is not modified");
});

test("planMove: dropping onto the group a container is already in is a no-op", () => {
  const r = planMove({ web: "Frontend" }, ["web"], "Frontend");
  assert.deepEqual(r.moved, []); assert.deepEqual(r.next, { web: "Frontend" });
});

test("planMove: null takes containers out of their groups (ungrouped); unknown ones are ignored", () => {
  const r = planMove({ web: "Frontend", api: "Backend" }, ["web", "ghost"], null);
  assert.deepEqual(r.next, { api: "Backend" }); assert.deepEqual(r.moved, ["web"]); assert.equal(r.group, null);
  assert.deepEqual(planMove({}, ["a"], null).moved, []);
});

test("planMove keeps the existing spelling of a group (case-insensitive) and trims", () => {
  assert.equal(planMove({ web: "Frontend" }, ["api"], "  frontend ").group, "Frontend");
  assert.equal(planMove({ web: "Frontend" }, ["api"], "New").group, "New");
});

test("planMove de-duplicates names and handles many", () => {
  const r = planMove({}, ["a", "a", "b"], "G");
  assert.deepEqual(r.moved, ["a", "b"]);
  const many = Array.from({ length: 200 }, (_, i) => "c" + i);
  assert.equal(planMove({}, many, "G").moved.length, 200);
});

test("parseDependencies reads the condition, defaulting to service_started", () => {
  assert.deepEqual(parseDependencies("db:service_healthy:false,job:service_completed_successfully:true,cache"), [
    { service: "db", condition: "service_healthy" }, { service: "job", condition: "service_completed_successfully" }, { service: "cache", condition: "service_started" }]);
  assert.deepEqual(parseDependencies(""), []); assert.deepEqual(parseDependencies(undefined), []);
});

test("dependencyRequirements: only dependencies inside the selection, with their condition", () => {
  const c = (id, service, dep) => ({ id, labels: { "com.docker.compose.service": service, ...(dep ? { "com.docker.compose.depends_on": dep } : {}) } });
  const sel = [c("api", "api", "db:service_healthy:false,cache:service_started:false,ghost:service_healthy:false"), c("db", "db"), c("cache", "cache")];
  const r = dependencyRequirements(sel);
  assert.deepEqual(r.get("api"), [{ id: "db", service: "db", condition: "service_healthy" }, { id: "cache", service: "cache", condition: "service_started" }], "ghost does not exist: ignored");
  assert.deepEqual(r.get("db"), []);
  const selfDep = dependencyRequirements([c("x", "x", "x:service_healthy:false")]);
  assert.deepEqual(selfDep.get("x"), [], "self-references are ignored");
  assert.deepEqual([...dependencyRequirements([{ id: "plain" }]).get("plain")], [], "containers with no labels have no requirements");
});

test("evaluateDependency: service_healthy", () => {
  const run = (Health) => ({ Running: true, ...(Health ? { Health } : {}) });
  assert.deepEqual(evaluateDependency("service_healthy", run({ Status: "healthy" })), { state: "ready" });
  assert.deepEqual(evaluateDependency("service_healthy", run({ Status: "starting" })), { state: "wait" });
  assert.deepEqual(evaluateDependency("service_healthy", run({ Status: "unhealthy" })), { state: "fail", code: "dep_unhealthy" });
  assert.deepEqual(evaluateDependency("service_healthy", run()), { state: "ready" }, "no health check: nothing to wait for");
  assert.deepEqual(evaluateDependency("service_healthy", { Running: false, Status: "exited", ExitCode: 1 }), { state: "fail", code: "dep_exited" });
  assert.deepEqual(evaluateDependency("service_healthy", { Running: false, Restarting: true, Health: { Status: "starting" } }), { state: "wait" }, "a restarting container is waited for");
});

test("evaluateDependency: service_completed_successfully", () => {
  assert.deepEqual(evaluateDependency("service_completed_successfully", { Running: true }), { state: "wait" });
  assert.deepEqual(evaluateDependency("service_completed_successfully", { Running: false, Status: "exited", ExitCode: 0 }), { state: "ready" });
  assert.deepEqual(evaluateDependency("service_completed_successfully", { Running: false, Status: "exited", ExitCode: 3 }), { state: "fail", code: "dep_exited" });
  assert.deepEqual(evaluateDependency("service_completed_successfully", { Running: false, Status: "created" }), { state: "wait" });
});

test("evaluateDependency: service_started and unknown conditions never wait", () => {
  assert.deepEqual(evaluateDependency("service_started", { Running: false }), { state: "ready" });
  assert.deepEqual(evaluateDependency("something_new", undefined), { state: "ready" });
});

/** A fake clock so the waiting logic is tested without real time. */
function clock() { const c = { t: 0 }; return { now: () => c.t, sleep: async (ms) => { c.t += ms; }, c }; }

test("waitForDependency: waits until healthy, polling at the interval", async () => {
  const k = clock(); let calls = 0;
  const r = await waitForDependency("service_healthy", async () => ({ Running: true, Health: { Status: ++calls < 4 ? "starting" : "healthy" } }), { ...k, intervalMs: 500, timeoutMs: 10000 });
  assert.deepEqual(r, { ok: true }); assert.equal(calls, 4); assert.equal(k.c.t, 1500);
});

test("waitForDependency: gives up at the timeout", async () => {
  const k = clock();
  const r = await waitForDependency("service_healthy", async () => ({ Running: true, Health: { Status: "starting" } }), { ...k, intervalMs: 500, timeoutMs: 3000 });
  assert.deepEqual(r, { ok: false, code: "dep_timeout" }); assert.ok(k.c.t >= 3000 && k.c.t <= 3500);
});

test("waitForDependency: fails fast when the dependency becomes unhealthy or dies", async () => {
  const k = clock();
  assert.deepEqual(await waitForDependency("service_healthy", async () => ({ Running: true, Health: { Status: "unhealthy" } }), { ...k, timeoutMs: 60000 }), { ok: false, code: "dep_unhealthy" });
  assert.equal(k.c.t, 0, "no waiting before failing");
  assert.deepEqual(await waitForDependency("service_healthy", async () => ({ Running: false, Status: "exited", ExitCode: 137 }), { ...k }), { ok: false, code: "dep_exited" });
});

test("waitForDependency: an inspect error is reported, not thrown", async () => {
  const r = await waitForDependency("service_healthy", async () => { throw new Error("no such container"); }, clock());
  assert.deepEqual(r, { ok: false, code: "dep_missing" });
});

test("waitForDependency: an init container that completes successfully is waited for", async () => {
  const k = clock(); let n = 0;
  const r = await waitForDependency("service_completed_successfully", async () => (++n < 3 ? { Running: true } : { Running: false, Status: "exited", ExitCode: 0 }), { ...k, intervalMs: 100 });
  assert.deepEqual(r, { ok: true }); assert.equal(n, 3);
});

test("dependencies are resolved inside the same Compose project (two stacks can both have a db)", () => {
  const c = (id, project, service, dep) => ({ id, labels: { "com.docker.compose.project": project, "com.docker.compose.service": service, ...(dep ? { "com.docker.compose.depends_on": dep } : {}) } });
  const both = [c("a-api", "A", "api", "db:service_healthy:false"), c("a-db", "A", "db"), c("b-api", "B", "api", "db:service_healthy:false"), c("b-db", "B", "db")];
  const r = dependencyRequirements(both);
  assert.deepEqual(r.get("a-api").map((x) => x.id), ["a-db"], "stack A's api waits only for stack A's db");
  assert.deepEqual(r.get("b-api").map((x) => x.id), ["b-db"]);
  // ordering too: B's db must not hold up A's api
  const onlyAApiAndBDb = [c("a-api", "A", "api", "db:service_healthy:false"), c("b-db", "B", "db")];
  assert.deepEqual(planLayers(onlyAApiAndBDb, "start").map((l) => [...l].sort()), [["a-api", "b-db"]], "no ordering across projects");
});

test("dependencyRequirements can look outside the selection (so a still-starting database is waited for)", () => {
  const c = (id, service, dep) => ({ id, labels: { "com.docker.compose.project": "shop", "com.docker.compose.service": service, ...(dep ? { "com.docker.compose.depends_on": dep } : {}) } });
  const api = c("api", "api", "db:service_healthy:false"), db = c("db", "db");
  assert.deepEqual(dependencyRequirements([api]).get("api"), [], "within the selection alone, db is unknown");
  assert.deepEqual(dependencyRequirements([api], [api, db]).get("api"), [{ id: "db", service: "db", condition: "service_healthy" }], "but it is found in the full list");
});

test("waitForDependency reports progress while it waits, and not when the dependency is already ready", async () => {
  const k = clock(), ticks = []; let n = 0;
  await waitForDependency("service_healthy", async () => ({ Running: true, Health: { Status: ++n < 4 ? "starting" : "healthy" } }), { ...k, intervalMs: 500, onWait: (ms) => ticks.push(ms) });
  assert.deepEqual(ticks, [0, 500, 1000], "one tick per poll that had to wait, with the elapsed time");
  const quiet = [];
  await waitForDependency("service_healthy", async () => ({ Running: true, Health: { Status: "healthy" } }), { ...clock(), onWait: (ms) => quiet.push(ms) });
  assert.deepEqual(quiet, [], "no progress noise when there is nothing to wait for");
});

test("waitForDependency can be cancelled and stops polling", async () => {
  const k = clock(), ac = new AbortController(); let polls = 0;
  const r = await waitForDependency("service_healthy", async () => { polls++; if (polls === 3) ac.abort(); return { Running: true, Health: { Status: "starting" } }; }, { ...k, intervalMs: 500, timeoutMs: 60000, signal: ac.signal });
  assert.deepEqual(r, { ok: false, code: "cancelled" }); assert.equal(polls, 3, "no more polls after the cancel");
  const pre = new AbortController(); pre.abort();
  assert.deepEqual(await waitForDependency("service_healthy", async () => { throw new Error("must not be called"); }, { ...clock(), signal: pre.signal }), { ok: false, code: "cancelled" }, "already cancelled: it does not even look");
});
