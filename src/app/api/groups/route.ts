import { guard, json, fail } from "@/lib/docker";
import { applyGroupOp, GroupError, readGroups } from "@/lib/groups";
import { BatchError, validateGroupOp } from "@/lib/groups-core.mjs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try { return json(readGroups()); } catch (e) { return fail(e); }
}

/** One operation per request: assign / unassign containers, rename a group, or dissolve it (containers are never touched). */
export async function PUT(req: Request) {
  const g = guard(req); if (g) return g;
  let op;
  try { op = validateGroupOp(await req.json().catch(() => null)); }
  catch (e) { const code = e instanceof BatchError ? e.code : "invalid_group_op"; return json({ error: code, code }, 400); }
  try { applyGroupOp(op); return json(readGroups()); }
  catch (e) { if (e instanceof GroupError) return json({ error: e.code, code: e.code }, e.code === "no_such_group" ? 404 : 400); return fail(e); }
}
