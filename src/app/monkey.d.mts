export type Role = "head" | "face" | "ink";
export const BRAND: Record<Role, string>;
export const SHAPES: { t: string; role: Role; [k: string]: unknown }[];
export function roleAt(x: number, y: number): Role | null;
export function monkeySvg(colors?: Record<Role, string>, opts?: { size?: number }): string;
