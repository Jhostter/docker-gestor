// The Docker Kong mark: a monkey's face, drawn once from simple shapes on a 32x32 grid. The app logo, the favicon,
// the README banner and the tray icons are all generated from this list (see tray/make-icons.mjs), so they cannot drift.
// Roles: "head" (fur), "face" (muzzle, inner ears), "ink" (eyes, nostrils, smile).
export const BRAND = { head: "#a8683a", face: "#f5dcb8", ink: "#2e1d12" };

export const SHAPES = [
  { t: "circle", cx: 5.5, cy: 14, r: 5, role: "head" }, { t: "circle", cx: 26.5, cy: 14, r: 5, role: "head" },   // ears
  { t: "circle", cx: 5.5, cy: 14, r: 2.6, role: "face" }, { t: "circle", cx: 26.5, cy: 14, r: 2.6, role: "face" },
  { t: "circle", cx: 16, cy: 17, r: 12.5, role: "head" },                                                       // head
  { t: "circle", cx: 11.5, cy: 15, r: 5, role: "face" }, { t: "circle", cx: 20.5, cy: 15, r: 5, role: "face" }, // brow bumps
  { t: "ellipse", cx: 16, cy: 21.5, rx: 7.5, ry: 6, role: "face" },                                             // muzzle
  { t: "circle", cx: 12.5, cy: 15.5, r: 1.5, role: "ink" }, { t: "circle", cx: 19.5, cy: 15.5, r: 1.5, role: "ink" }, // eyes
  { t: "circle", cx: 14.6, cy: 20.4, r: 0.8, role: "ink" }, { t: "circle", cx: 17.4, cy: 20.4, r: 0.8, role: "ink" }, // nostrils
  { t: "smile", cx: 16, cy: 20.6, r: 3.6, w: 0.9, role: "ink" },                                                // smile
];

/** Role at a point, or null (transparent). The last shape that covers the point wins, like painting in order. */
export function roleAt(x, y) {
  let role = null;
  for (const s of SHAPES) {
    const hit = s.t === "circle" ? Math.hypot(x - s.cx, y - s.cy) <= s.r
      : s.t === "ellipse" ? ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1
      : y > s.cy + 2 && Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) <= s.w / 2; // the lower arc of a ring
    if (hit) role = s.role;
  }
  return role;
}

/** The same drawing as an SVG string. `colors` maps each role to a CSS colour. */
export function monkeySvg(colors = BRAND, { size } = {}) {
  const f = (n) => +n.toFixed(2);
  const body = SHAPES.map((s) => {
    if (s.t === "circle") return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${colors[s.role]}"/>`;
    if (s.t === "ellipse") return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${colors[s.role]}"/>`;
    const dy = 2, dx = Math.sqrt(s.r * s.r - dy * dy); // where the ring crosses y = cy + 2
    return `<path d="M${f(s.cx - dx)} ${f(s.cy + dy)}A${s.r} ${s.r} 0 0 0 ${f(s.cx + dx)} ${f(s.cy + dy)}" fill="none" stroke="${colors[s.role]}" stroke-width="${s.w}" stroke-linecap="round"/>`;
  }).join("");
  const dim = size ? ` width="${size}" height="${size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"${dim}>${body}</svg>`;
}
