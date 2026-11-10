import test from "node:test";
import assert from "node:assert/strict";
import { scoreToken, rank, highlight } from "../src/lib/palette-core.mjs";

const items = [
  { id: "nav-containers", label: "Go to Containers" }, { id: "nav-images", label: "Go to Images" },
  { id: "d-api", label: "Details · shop-api", hint: "ghcr.io/acme/shop-api:2.4.1" }, { id: "l-api", label: "Logs · shop-api" },
  { id: "d-web", label: "Details · shop-web", hint: "nginx:1.27-alpine" }, { id: "l-db", label: "Logs · shop-db", hint: "postgres:16-alpine" },
  { id: "theme", label: "Toggle theme", keywords: ["dark", "light", "tema", "oscuro"] },
];
const ids = (q, list = items) => rank(q, list).map((i) => i.id);

test("scoring: exact > prefix > word start > substring > fuzzy > none", () => {
  const s = (t, q) => scoreToken(t, q);
  assert.ok(s("api", "api") > s("api-gateway", "api"));
  assert.ok(s("api-gateway", "api") > s("shop-api", "api"), "prefix beats a word that starts later");
  assert.ok(s("shop-api", "api") > s("shopapi", "api"), "a word boundary beats a plain substring");
  assert.ok(s("shopapi", "api") > s("shop-web", "shpw"), "substring beats fuzzy");
  assert.ok(s("shop-web", "shpw") > 0);
  assert.equal(s("shop-web", "zzz"), -1);
});

test("an empty query returns everything in the original order", () => {
  assert.deepEqual(ids(""), items.map((i) => i.id));
  assert.deepEqual(ids("   "), items.map((i) => i.id));
});

test("every word has to match, in any order and in any field", () => {
  assert.deepEqual(ids("logs api"), ["l-api"]);
  assert.deepEqual(ids("api logs"), ["l-api"]);
  assert.deepEqual(ids("details nginx"), ["d-web"], "words can match the hint");
  assert.deepEqual(ids("zzz"), []);
});

test("it is case- and accent-insensitive, and keywords find items", () => {
  assert.deepEqual(ids("DETAILS"), ["d-api", "d-web"]);
  assert.deepEqual(ids("OSCURO"), ["theme"]);
  assert.deepEqual(ids("óscuro"), ["theme"], "accents are ignored");
  assert.deepEqual(rank("cafe", [{ id: "x", label: "Café" }]).map((i) => i.id), ["x"]);
});

test("better matches come first, ties keep the original order", () => {
  const r = ids("shop-api");
  assert.equal(r[0] === "l-api" || r[0] === "d-api", true);
  assert.deepEqual(ids("go to"), ["nav-images", "nav-containers"], "between equally good matches, the shorter title ranks first");
  const tie = rank("item", [{ id: "1", label: "Item" }, { id: "2", label: "Item" }, { id: "3", label: "Item" }]).map((i) => i.id);
  assert.deepEqual(tie, ["1", "2", "3"], "an exact tie keeps the original order");
  const prefixFirst = rank("log", [{ id: "a", label: "Catalog" }, { id: "b", label: "Logs" }]).map((i) => i.id);
  assert.deepEqual(prefixFirst, ["b", "a"], "a prefix match beats a mid-word match");
});

test("fuzzy matching finds in-order characters, but only in the title and from 4 characters", () => {
  assert.deepEqual(ids("shpw"), ["d-web"]);
  assert.deepEqual(ids("pstgrs"), [], "the hint is not fuzzy-matched");
  assert.deepEqual(ids("logs api"), ["l-api"], "'api' must not match inside 'alpine'");
  assert.equal(scoreToken("shop-web", "sw"), -1, "two letters are not enough for fuzzy matching");
  assert.equal(scoreToken("shop-web", "swe"), -1, "nor are three");
  assert.equal(scoreToken("Logs · mailpit", "api"), -1, "'api' must not match the scattered letters of 'mailpit'");
  assert.ok(scoreToken("shop-web", "shwb") > 0, "four scattered letters do");
});

test("limit and regex-looking queries are safe", () => {
  assert.equal(rank("o", Array.from({ length: 100 }, (_, i) => ({ id: "i" + i, label: "foo" + i })), 10).length, 10);
  assert.doesNotThrow(() => rank("(.*+?[", items));
  assert.doesNotThrow(() => rank("\\", items));
  assert.deepEqual(ids("shop.api"), [], "a dot is a character, not a wildcard");
});

test("highlight marks the matching characters and keeps the text intact", () => {
  const h = highlight("Logs · shop-api", "api");
  assert.equal(h.map((x) => x.text).join(""), "Logs · shop-api");
  assert.deepEqual(h.filter((x) => x.hit).map((x) => x.text), ["api"]);
  assert.deepEqual(highlight("abc", "").map((x) => x.hit), [false]);
  assert.deepEqual(highlight("Café", "cafe").filter((x) => x.hit).map((x) => x.text), ["Café"], "accents do not break the highlight");
  assert.deepEqual(highlight("shop-web", "shpw").filter((x) => x.hit).map((x) => x.text).join(""), "shpw".replace("shpw", "shpw"));
});
