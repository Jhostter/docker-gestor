export type BatchAction = "start" | "stop" | "restart" | "remove";
export const ACTIONS: BatchAction[];
export const MAX_IDS: number;
export class BatchError extends Error { code: string; constructor(code: string); }
export function validateBatch(body: unknown): { action: BatchAction; ids: string[] };
export function parseDependsOn(label?: string): string[];
export function planLayers(containers: { id: string; labels?: Record<string, string> }[], action: BatchAction): string[][];
