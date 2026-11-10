import { docker, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try {
    const list = await Promise.all((await docker.listNetworks()).map((n) => docker.getNetwork(n.Id).inspect()));
    return json(list.map((n) => ({
      id: n.Id, name: n.Name, driver: n.Driver, scope: n.Scope,
      subnet: n.IPAM?.Config?.[0]?.Subnet ?? null,
      containers: Object.values((n.Containers ?? {}) as Record<string, { Name: string }>).map((c) => c.Name),
      builtin: ["bridge", "host", "none"].includes(n.Name),
    })));
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  const { name, driver = "bridge" } = await req.json();
  if (typeof name !== "string" || !/^[\w.-]{1,64}$/.test(name)) return json({ error: "nombre inválido" }, 400);
  if (!["bridge", "overlay", "macvlan"].includes(driver)) return json({ error: "driver inválido" }, 400);
  try { await docker.createNetwork({ Name: name, Driver: driver }); return json({ ok: true }); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const g = guard(req); if (g) return g;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "falta id" }, 400);
  try { await docker.getNetwork(id).remove(); return json({ ok: true }); } catch (e) { return fail(e); }
}
