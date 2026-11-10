// Custom container groups, stored by container NAME (so they survive recreating a container) in the SQLite database.
import { db } from "./history";
import { MAX_GROUPS, canonicalGroup, type GroupOp } from "./groups-core.mjs";

export class GroupError extends Error { constructor(public code: string) { super(code); } }

export function readGroups() {
  const rows = db().prepare("SELECT name, grp FROM container_groups").all() as { name: string; grp: string }[];
  const assignments: Record<string, string> = {}, counts = new Map<string, number>();
  for (const r of rows) { assignments[r.name] = r.grp; counts.set(r.grp, (counts.get(r.grp) ?? 0) + 1); }
  return { assignments, groups: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export function applyGroupOp(op: GroupOp) {
  const d = db(), names = () => (d.prepare("SELECT DISTINCT grp FROM container_groups").all() as { grp: string }[]).map((r) => r.grp);
  d.exec("BEGIN");
  try {
    if (op.kind === "assign") {
      if (op.group === null) { const del = d.prepare("DELETE FROM container_groups WHERE name = ?"); for (const n of op.names) del.run(n); }
      else {
        const existing = names(), group = canonicalGroup(op.group, existing);
        if (!existing.includes(group) && existing.length >= MAX_GROUPS) throw new GroupError("too_many_groups");
        const up = d.prepare("INSERT INTO container_groups(name, grp) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET grp = excluded.grp");
        for (const n of op.names) up.run(n, group);
      }
    } else if (op.kind === "rename") {
      const existing = names(), from = canonicalGroup(op.from, existing);
      if (!existing.includes(from)) throw new GroupError("no_such_group");
      const to = canonicalGroup(op.to, existing.filter((g) => g !== from)); // merging into another group is allowed
      d.prepare("UPDATE container_groups SET grp = ? WHERE grp = ?").run(to, from);
    } else {
      const existing = names(), g = canonicalGroup(op.group, existing);
      d.prepare("DELETE FROM container_groups WHERE grp = ?").run(g); // only the assignment: containers are never touched
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
