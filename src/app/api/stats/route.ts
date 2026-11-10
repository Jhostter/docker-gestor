import { docker, snapshot, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

/** Foto de CPU/RAM de los contenedores en ejecución. */
export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try { return json(await Promise.all((await docker.listContainers()).map(snapshot))); } catch (e) { return fail(e); }
}
