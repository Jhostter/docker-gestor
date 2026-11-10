export type BatchAction = "start" | "stop" | "restart" | "remove";
export const ACTIONS: BatchAction[];
export const MAX_IDS: number;
export class BatchError extends Error { code: string; constructor(code: string); }
export function validateBatch(body: unknown): { action: BatchAction; ids: string[] };
export function parseDependsOn(label?: string): string[];
export function planLayers(containers: { id: string; labels?: Record<string, string> }[], action: BatchAction): string[][];
export const MAX_GROUPS: number;
export const MAX_GROUP_NAME: number;
export function validateGroupName(name: unknown): string;
export type GroupOp = { kind: "assign"; names: string[]; group: string | null } | { kind: "rename"; from: string; to: string } | { kind: "dissolve"; group: string };
export function validateGroupOp(body: unknown): GroupOp;
export function canonicalGroup(name: string, existing: Iterable<string>): string;
export function planMove(assignments: Record<string, string>, names: string[], group: string | null): { next: Record<string, string>; moved: string[]; group: string | null };
