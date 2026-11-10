import { homedir } from "node:os";
import { join } from "node:path";

/** Data folder per OS (honors DATA_DIR, and XDG_DATA_HOME on Linux). */
export function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const h = homedir();
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(h, "AppData", "Local"), "docker-gestor");
  if (process.platform === "darwin") return join(h, "Library", "Application Support", "docker-gestor");
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), "docker-gestor");
}
