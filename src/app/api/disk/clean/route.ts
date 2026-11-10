import { guard, json, fail } from "@/lib/docker";
import { clean } from "@/lib/disk";
import { SelectionError, validateSelection } from "@/lib/disk-core.mjs";

export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  let sel;
  try { sel = validateSelection(await req.json().catch(() => null)); }
  catch (e) { return json({ error: e instanceof SelectionError ? e.code : "invalid_selection", code: e instanceof SelectionError ? e.code : "invalid_selection" }, 400); }
  try { return json({ results: await clean(sel) }); } catch (e) { return fail(e); }
}
