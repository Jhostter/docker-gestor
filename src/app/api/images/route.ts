import { docker, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try {
    const list = await docker.listImages();
    return json(list.map((i) => ({ id: i.Id, tags: i.RepoTags ?? [], size: i.Size, created: i.Created })));
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const g = guard(req); if (g) return g;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "falta id" }, 400);
  try { await docker.getImage(id).remove(); return json({ ok: true }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  const { ref } = await req.json();
  if (typeof ref !== "string" || !/^[\w./:@-]+$/.test(ref)) return json({ error: "referencia inválida" }, 400);
  try {
    const stream = await docker.pull(ref);
    await new Promise((res, rej) => docker.modem.followProgress(stream, (e) => (e ? rej(e) : res(null))));
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
