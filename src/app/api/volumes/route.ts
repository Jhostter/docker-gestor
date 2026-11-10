import { docker, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try {
    const { Volumes } = await docker.listVolumes();
    return json((Volumes ?? []).map((v) => ({ name: v.Name, driver: v.Driver, mountpoint: v.Mountpoint, created: (v as { CreatedAt?: string }).CreatedAt })));
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const g = guard(req); if (g) return g;
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return json({ error: "missing name" }, 400);
  try { await docker.getVolume(name).remove(); return json({ ok: true }); } catch (e) { return fail(e); }
}
