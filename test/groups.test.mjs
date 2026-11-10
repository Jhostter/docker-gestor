import test from "node:test";
import assert from "node:assert/strict";
import { planLayers, parseDependsOn, validateBatch, BatchError, MAX_IDS } from "../src/lib/groups-core.mjs";

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
