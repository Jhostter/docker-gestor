export type DockerOptions = { socketPath?: string; host?: string; port?: number; protocol?: "http" | "https" };
export type Detected = { options: DockerOptions; source: string };
export function parseHost(h: string | undefined): DockerOptions | null;
export function detectDocker(deps?: {
  env?: Record<string, string | undefined>; platform?: string; home?: string; uid?: number;
  exists?: (p: string) => boolean; context?: () => string;
}): Detected;
export function describe(o: DockerOptions): string;
export function detected(): Detected;
