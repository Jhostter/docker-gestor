export type PaletteItem = { id: string; label: string; hint?: string; keywords?: string[] };
export function scoreToken(text: string, token: string, fuzzy?: boolean): number;
export function rank<T extends PaletteItem>(query: string, items: T[], limit?: number): T[];
export function highlight(text: string, query: string): { text: string; hit: boolean }[];
