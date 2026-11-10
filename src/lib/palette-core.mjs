// Fuzzy ranking for the command palette, with no I/O. Case- and accent-insensitive; every word of the query has to match.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** How well one token matches a text: higher is better, -1 means no match. `fuzzy` allows in-order scattered letters (4+ characters). */
export function scoreToken(text, token, fuzzy = true) {
  const t = norm(text), q = norm(token);
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - t.length * 0.1;
  const word = t.search(new RegExp(`[\\s\\-_/.:·]${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (word >= 0) return 800 - word;
  const at = t.indexOf(q);
  if (at >= 0) return 700 - at * 2;
  if (!fuzzy || q.length < 4) return -1;
  let j = 0, gaps = 0, last = -1; // in-order subsequence ("shpw" matches "shop-web")
  for (let i = 0; i < t.length && j < q.length; i++) if (t[i] === q[j]) { if (last >= 0) gaps += i - last - 1; last = i; j++; }
  return j === q.length ? 300 - gaps : -1;
}

/**
 * Ranks `items` ({ id, label, hint?, keywords? }) for `query`. Items that match every word of the query are returned,
 * best first (ties keep their original order). An empty query returns everything in the original order.
 */
export function rank(query, items, limit = 50) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return items.slice(0, limit);
  const scored = [];
  items.forEach((item, order) => {
    let total = 0;
    for (const tok of tokens) {
      // scattered-letter matching only on the title: on hints it matched things like "api" inside "alpine"
      const s = Math.max(scoreToken(item.label, tok), scoreToken(item.hint ?? "", tok, false) * 0.6, ...(item.keywords ?? []).map((k) => scoreToken(k, tok, false) * 0.5));
      if (s < 0) return;
      total += s;
    }
    scored.push({ item, total, order });
  });
  return scored.sort((a, b) => b.total - a.total || a.order - b.order).slice(0, limit).map((x) => x.item);
}

/** Splits `text` into [{ text, hit }] so the matching characters of the query can be emphasised. */
export function highlight(text, query) {
  const t = norm(text), out = [];
  const hit = new Array(text.length).fill(false);
  for (const tok of norm(query).split(/\s+/).filter(Boolean)) {
    const at = t.indexOf(tok);
    if (at >= 0) { for (let i = at; i < at + tok.length; i++) hit[i] = true; continue; }
    let j = 0; for (let i = 0; i < t.length && j < tok.length; i++) if (t[i] === tok[j]) { hit[i] = true; j++; }
  }
  for (let i = 0; i < text.length; i++) { const last = out[out.length - 1]; if (last && last.hit === hit[i]) last.text += text[i]; else out.push({ text: text[i], hit: hit[i] }); }
  return out;
}
