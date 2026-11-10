import test from "node:test";
import assert from "node:assert/strict";
import { SERIES_LEN, emptySeries, pushSeries, sortContainers, topConsumer, hostMemory, sparkPoints } from "../src/app/metrics-core.mjs";

const st = (id, name, cpu, mem, limit = 1000) => ({ id, name, cpu, mem, limit });

test("series keep the last N samples, drop containers that are gone, and total across containers", () => {
  let s = emptySeries();
  for (let i = 0; i < SERIES_LEN + 5; i++) s = pushSeries(s, [st("a", "a", i, 10), st("b", "b", 1, 20)]);
  assert.equal(s.byId.a.cpu.length, SERIES_LEN);
  assert.equal(s.byId.a.cpu.at(-1), SERIES_LEN + 4);
  assert.equal(s.total.cpu.length, SERIES_LEN);
  assert.equal(s.total.mem.at(-1), 30);
  s = pushSeries(s, [st("a", "a", 1, 10)]);
  assert.deepEqual(Object.keys(s.byId), ["a"], "b is gone");
  assert.equal(s.byId.a.cpu.length, SERIES_LEN, "a keeps its history");
});

test("pushSeries does not mutate what it was given (React state)", () => {
  const s = pushSeries(emptySeries(), [st("a", "a", 1, 1)]);
  const before = JSON.stringify(s);
  pushSeries(s, [st("a", "a", 2, 2)]);
  assert.equal(JSON.stringify(s), before);
});

test("sorting: default keeps the order; name A→Z; cpu / mem biggest first with stopped ones last", () => {
  const list = [{ id: "1", name: "web" }, { id: "2", name: "api" }, { id: "3", name: "db" }, { id: "4", name: "off" }];
  const stats = { 1: st("1", "web", 5, 300), 2: st("2", "api", 50, 100), 3: st("3", "db", 50, 900) };
  const names = (by) => sortContainers(list, stats, by).map((c) => c.name);
  assert.deepEqual(names("default"), ["web", "api", "db", "off"]);
  assert.deepEqual(names("name"), ["api", "db", "off", "web"]);
  assert.deepEqual(names("cpu"), ["api", "db", "web", "off"], "ties by name; stopped last");
  assert.deepEqual(names("mem"), ["db", "web", "api", "off"]);
  assert.deepEqual(names("whatever"), ["web", "api", "db", "off"]);
  assert.deepEqual(list.map((c) => c.name), ["web", "api", "db", "off"], "the input is not reordered in place");
});

test("topConsumer and hostMemory", () => {
  assert.equal(topConsumer({}, "cpu"), null);
  assert.equal(topConsumer({ a: st("a", "a", 0, 0) }, "cpu"), null, "all zero is nobody");
  assert.deepEqual(topConsumer({ a: st("a", "a", 3, 5), b: st("b", "b", 9, 1) }, "cpu"), { name: "b", value: 9 });
  assert.deepEqual(topConsumer({ a: st("a", "a", 3, 5), b: st("b", "b", 9, 1) }, "mem"), { name: "a", value: 5 });
  assert.equal(hostMemory({}), 0);
  assert.equal(hostMemory({ a: st("a", "a", 0, 0, 512), b: st("b", "b", 0, 0, 8000), c: st("c", "c", 0, 0, 0) }), 8000);
});

test("sparkline points: needs two samples, stays inside the box, never divides by zero", () => {
  assert.equal(sparkPoints([], 64, 18), "");
  assert.equal(sparkPoints([5], 64, 18), "");
  const ys = (pts) => pts.split(" ").map((p) => Number(p.split(",")[1]));
  const inBox = (pts) => pts.split(" ").every((p) => { const [x, y] = p.split(",").map(Number); return x >= 0 && x <= 64 && y >= 0 && y <= 18; });
  assert.ok(inBox(sparkPoints([0, 50, 100, 20], 64, 18)));
  assert.ok(!/NaN|Infinity/.test(sparkPoints([0, 0, 0], 64, 18) + sparkPoints([0, 0, 0], 64, 18, { zoom: true }) + sparkPoints([1, 2, 3], 64, 18, { zoom: true })));
  assert.ok(ys(sparkPoints([0, 0, 0], 64, 18)).every((y) => y === 17), "no CPU = a line at the bottom");
  assert.ok(ys(sparkPoints([7, 7, 7], 64, 18)).every((y) => y > 9), "a steady 7% sits low (floor of 25), it does not look like 100%");
  assert.ok(ys(sparkPoints([0, 100], 64, 18)).join() === "17,1", "0 to 100 spans the box");
});

test("sparkline zoom: a flat memory series is a middle line, a small change becomes visible", () => {
  const ys = (pts) => pts.split(" ").map((p) => Number(p.split(",")[1]));
  assert.ok(ys(sparkPoints([500, 500, 500], 64, 18, { zoom: true })).every((y) => y === 9));
  const range = (v) => Math.max(...v) - Math.min(...v);
  assert.ok(range(ys(sparkPoints([1000, 1100, 1300], 64, 18))) < 5, "from zero the wiggle is nearly flat");
  assert.ok(range(ys(sparkPoints([1000, 1100, 1300], 64, 18, { zoom: true }))) > 10, "zoomed in it is plain to see");
});
