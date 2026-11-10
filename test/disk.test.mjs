import test from "node:test";
import assert from "node:assert/strict";
import { analyze, validateSelection, SelectionError } from "../src/lib/disk-core.mjs";

const MB = 1e6;
const df = {
  LayersSize: 700 * MB,
  Images: [
    { Id: "sha256:" + "a".repeat(64), RepoTags: ["app:1"], Size: 300 * MB, SharedSize: 100 * MB, Containers: 1, Created: 1 },
    { Id: "sha256:" + "b".repeat(64), RepoTags: ["base:1"], Size: 200 * MB, SharedSize: 100 * MB, Containers: 0, Created: 2 },
    { Id: "sha256:" + "c".repeat(64), RepoTags: null, Size: 150 * MB, SharedSize: 0, Containers: 0, Created: 3 },
    { Id: "sha256:" + "d".repeat(64), RepoTags: ["<none>:<none>"], Size: 50 * MB, SharedSize: 0, Containers: 0, Created: 4 },
    { Id: "sha256:" + "e".repeat(64), RepoTags: ["mystery:1"], Size: 99 * MB, SharedSize: 0, Containers: -1, Created: 5 },
  ],
  Containers: [
    { Id: "1".repeat(64), Names: ["/web"], Image: "app:1", State: "running", SizeRw: 10 * MB },
    { Id: "2".repeat(64), Names: ["/job"], Image: "app:1", State: "exited", SizeRw: 40 * MB },
    { Id: "3".repeat(64), Names: ["/db"], Image: "pg", State: "paused", SizeRw: 5 * MB },
  ],
  Volumes: [
    { Name: "used_data", UsageData: { Size: 500 * MB, RefCount: 1 } },
    { Name: "orphan", UsageData: { Size: 300 * MB, RefCount: 0 } },
    { Name: "unknown", UsageData: { Size: -1, RefCount: -1 } },
    { Name: "legacy" }, // no usage data: must not be offered for removal
  ],
  BuildCache: [{ ID: "x", Size: 120 * MB, InUse: false }, { ID: "y", Size: 30 * MB, InUse: true }, { ID: "z", Size: 50 * MB, InUse: false }],
};

test("images: reclaimable is the exclusive size of the unused ones (as `docker system df` reports it)", () => {
  const r = analyze(df);
  assert.equal(r.summary.images.total, 700 * MB);
  assert.equal(r.summary.images.reclaimable, (200 - 100) * MB + 150 * MB + 50 * MB, "base:1 exclusive + two untagged; the in-use and unknown images are not counted");
  assert.equal(r.summary.images.reclaimable, r.candidates.images.reduce((a, i) => a + i.size, 0), "equals what cleaning every candidate would free");
});

test("unused images: only Containers===0; unknown (-1) is never a candidate; dangling vs tagged", () => {
  const { images } = analyze(df).candidates;
  assert.deepEqual(images.map((i) => i.id.slice(7, 8)).sort(), ["b", "c", "d"]);
  assert.equal(images.find((i) => i.id.includes("b")).dangling, false);
  assert.equal(images.find((i) => i.id.includes("c")).dangling, true);
  assert.equal(images.find((i) => i.id.includes("d")).dangling, true, "<none>:<none> counts as untagged");
  assert.equal(images.find((i) => i.id.includes("b")).size, 100 * MB, "frees only the exclusive part, not the shared layers");
});

test("containers: anything not running/restarting/paused is a candidate", () => {
  const r = analyze(df);
  assert.deepEqual(r.candidates.containers.map((c) => c.name), ["job"]);
  assert.equal(r.summary.containers.active, 2);
  assert.equal(r.summary.containers.total, 55 * MB);
  assert.equal(r.summary.containers.reclaimable, 40 * MB);
});

test("volumes: only RefCount===0 with known usage can be removed", () => {
  const r = analyze(df);
  assert.deepEqual(r.candidates.volumes.map((v) => v.name), ["orphan"]);
  assert.equal(r.summary.volumes.reclaimable, 300 * MB);
  assert.equal(r.summary.volumes.total, 800 * MB);
});

test("build cache: reclaimable is what is not in use", () => {
  const r = analyze(df);
  assert.deepEqual(r.candidates.buildCache, { size: 170 * MB, count: 2 });
  assert.equal(r.summary.buildCache.total, 200 * MB);
});

test("totals add up and an empty Docker is handled", () => {
  const r = analyze(df);
  assert.equal(r.summary.total, 700 * MB + 55 * MB + 800 * MB + 200 * MB);
  const empty = analyze({});
  assert.equal(empty.summary.total, 0); assert.equal(empty.candidates.buildCache, null); assert.deepEqual(empty.candidates.images, []);
  assert.doesNotThrow(() => analyze(null));
});

test("validateSelection accepts sane input and de-duplicates", () => {
  const s = validateSelection({ containers: ["a".repeat(64), "a".repeat(64)], images: ["sha256:" + "b".repeat(64), "c".repeat(12)], volumes: ["my_vol-1.x"], buildCache: true });
  assert.equal(s.containers.length, 1); assert.equal(s.images.length, 2); assert.equal(s.buildCache, true);
});

test("validateSelection rejects anything unexpected", () => {
  const code = (b) => { try { validateSelection(b); } catch (e) { assert.ok(e instanceof SelectionError); return e.code; } };
  assert.equal(code({}), "empty_selection");
  assert.equal(code({ containers: ["../etc"] }), "invalid_selection");
  assert.equal(code({ images: ["nginx:latest"] }), "invalid_selection", "images are removed by id only");
  assert.equal(code({ volumes: ["-rf /"] }), "invalid_selection");
  assert.equal(code({ volumes: [".hidden"] }), "invalid_selection");
  assert.equal(code({ containers: "abc" }), "invalid_selection");
  assert.equal(code({ containers: Array(501).fill("a".repeat(12)).map((x, i) => x.slice(0, 11) + (i % 10)) }), "invalid_selection", "over the limit");
  assert.equal(code({ buildCache: "yes" }), "empty_selection", "buildCache must be a real boolean");
});
