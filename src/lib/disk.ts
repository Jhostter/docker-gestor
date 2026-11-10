// Disk usage report and cleanup. Removal is per item with no `force`: Docker itself refuses to delete anything in use.
import { docker } from "./docker";
import { analyze, type DiskReport, type Selection } from "./disk-core.mjs";

const TTL = 15_000; // /system/df can take seconds on big hosts: do not recompute on every tab switch
const g = globalThis as unknown as { __disk?: { at: number; report: DiskReport } };

export async function diskReport(fresh = false) {
  if (!fresh && g.__disk && Date.now() - g.__disk.at < TTL) return { ...g.__disk.report, at: g.__disk.at };
  const df = await (docker as unknown as { df(): Promise<unknown> }).df();
  const report = analyze(df);
  g.__disk = { at: Date.now(), report };
  return { ...report, at: g.__disk.at };
}

export type Result = { kind: "container" | "image" | "volume" | "buildCache"; ref: string; ok: boolean; error?: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function clean(sel: Selection): Promise<Result[]> {
  const out: Result[] = [];
  const run = async (kind: Result["kind"], ref: string, fn: () => Promise<void>) => {
    try { await fn(); out.push({ kind, ref, ok: true }); } catch (e) { out.push({ kind, ref, ok: false, error: msg(e) }); }
  };

  // Containers first: removing them can free their images and volumes for the steps below.
  for (const id of sel.containers) {
    await run("container", id.slice(0, 12), async () => {
      const info = await docker.getContainer(id).inspect();
      if (info.State.Running || info.State.Restarting || info.State.Paused) throw new Error("container is running");
      await docker.getContainer(id).remove({ force: false });
    });
  }
  for (const id of sel.images) {
    await run("image", id.replace("sha256:", "").slice(0, 12), async () => {
      const tags = ((await docker.getImage(id).inspect()).RepoTags ?? []).filter((t) => t && t !== "<none>:<none>");
      // An image with several tags cannot be removed by id without force: untag each name (the last one deletes it).
      if (tags.length) for (const t of tags) await docker.getImage(t).remove({ force: false });
      else await docker.getImage(id).remove({ force: false });
    });
  }
  for (const name of sel.volumes) await run("volume", name, () => docker.getVolume(name).remove({ force: false }));
  if (sel.buildCache) {
    await run("buildCache", "build-cache", () => new Promise<void>((resolve, reject) => {
      docker.modem.dial({ path: "/build/prune?", method: "POST", options: { all: true }, statusCodes: { 200: true, 500: "server error" } },
        (err: Error | null) => (err ? reject(err) : resolve()));
    }));
  }
  delete g.__disk; // the next report must be fresh
  return out;
}
