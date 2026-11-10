import { dirname } from "node:path";
import { docker, run, guard, json, fail } from "@/lib/docker";
export const dynamic = "force-dynamic";

type Stack = { name: string; dir: string; files: string[]; containers: number; running: number };

async function stacks(): Promise<Map<string, Stack>> {
  const map = new Map<string, Stack>();
  for (const c of await docker.listContainers({ all: true })) {
    const name = c.Labels["com.docker.compose.project"]; if (!name) continue;
    const files = (c.Labels["com.docker.compose.project.config_files"] ?? "").split(",").filter(Boolean);
    const s = map.get(name) ?? { name, dir: c.Labels["com.docker.compose.project.working_dir"] ?? dirname(files[0] ?? "."), files, containers: 0, running: 0 };
    s.containers++; if (c.State === "running") s.running++;
    map.set(name, s);
  }
  return map;
}

export async function GET(req: Request) {
  const g = guard(req); if (g) return g;
  try { return json([...(await stacks()).values()]); } catch (e) { return fail(e); }
}

/** Solo opera sobre stacks que Docker ya conoce; nunca sobre rutas enviadas por el cliente. */
export async function POST(req: Request) {
  const g = guard(req); if (g) return g;
  const { project, action } = await req.json();
  const s = (await stacks()).get(project);
  if (!s) return json({ error: "stack desconocido" }, 404);
  const cmd = ({ up: ["up", "-d"], down: ["down"], restart: ["restart"], stop: ["stop"], pull: ["pull"] } as Record<string, string[]>)[action];
  if (!cmd) return json({ error: "acción desconocida" }, 400);
  try {
    const args = ["compose", "-p", s.name, ...s.files.flatMap((f) => ["-f", f]), ...cmd];
    const { stdout, stderr } = await run("docker", args, { cwd: s.dir, timeout: 300_000 });
    return json({ ok: true, output: stdout + stderr });
  } catch (e) { return fail(e); }
}
