export type Summary = { count: number; total: number; reclaimable: number; active?: number };
export type ContainerCandidate = { id: string; name: string; image: string; state: string; size: number; created: number };
export type ImageCandidate = { id: string; tags: string[]; size: number; created: number; dangling: boolean };
export type VolumeCandidate = { name: string; size: number };
export type DiskReport = {
  summary: { images: Summary; containers: Summary; volumes: Summary; buildCache: Summary; total: number; reclaimable: number };
  candidates: { containers: ContainerCandidate[]; images: ImageCandidate[]; volumes: VolumeCandidate[]; buildCache: { size: number; count: number } | null };
};
export type Selection = { containers: string[]; images: string[]; volumes: string[]; buildCache: boolean };
export function analyze(df: unknown): DiskReport;
export class SelectionError extends Error { code: string; constructor(code: string); }
export function validateSelection(body: unknown): Selection;
