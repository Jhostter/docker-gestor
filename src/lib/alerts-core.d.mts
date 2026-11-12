export type Lang = "es" | "en";
export type Rule = "died" | "oom" | "unhealthy" | "restartLoop" | "cpu" | "memory";
export type AlertRule = Rule | "recovered" | "back_up" | "cpu_ok" | "memory_ok" | "test";
export type Mute = { kind: "container" | "stack" | "all"; name: string; until: number | null };
type Common = { exclude: string[]; cooldownMinutes: number | null };
export type AlertsConfig = {
  enabled: boolean; lang: Lang;
  rules: {
    died: { enabled: boolean } & Common; oom: { enabled: boolean } & Common; unhealthy: { enabled: boolean } & Common;
    restartLoop: { enabled: boolean; count: number; minutes: number } & Common;
    cpu: { enabled: boolean; percent: number; minutes: number } & Common;
    memory: { enabled: boolean; percent: number; minutes: number } & Common;
  };
  cooldownMinutes: number;
  recovery: boolean;
  mutes: Mute[];
  channels: {
    browser: { enabled: boolean };
    telegram: { enabled: boolean; token: string; chatId: string };
    webhook: { enabled: boolean; url: string; format: "json" | "text"; authorization: string };
  };
};
export type Alert = { ts: number; rule: AlertRule; name: string; image?: string; vars?: Record<string, string | number> };
export type DockerEventInfo = { action: string; id: string; name: string; image: string; exitCode?: string; project?: string };
export const SUPPRESS_MS: number;
export const STABLE_MS: number;
export const CALM_SAMPLES: number;
export function cleanMutes(list: unknown, now?: number): Mute[];
export function addMute(mutes: Mute[], m: { kind: Mute["kind"]; name: string; minutes?: number | null }, now?: number): Mute[];
export function removeMute(mutes: Mute[], m: { kind: Mute["kind"]; name: string }): Mute[];
export function isMuted(mutes: Mute[] | undefined, name: string, project?: string, now?: number): boolean;
export const DEFAULTS: AlertsConfig;
export class ConfigError extends Error { code: string; constructor(code: string); }
export function normalizeConfig(input?: unknown, current?: AlertsConfig): AlertsConfig;
export function publicConfig(cfg: AlertsConfig): unknown;
export function parseDockerEvent(raw: unknown): DockerEventInfo | null;
export function formatAlert(alert: Alert, lang?: Lang, host?: string): string;
export class AlertEngine {
  constructor(o: { getConfig: () => AlertsConfig; emit: (a: Alert) => void; now?: () => number; schedule?: (f: () => void, ms: number) => unknown; cancel?: (h: unknown) => void; sampleMs?: number; stableMs?: number });
  onEvent(e: DockerEventInfo): void;
  onSamples(snaps: { name: string; cpu: number; mem: number; limit: number; project?: string }[]): void;
}
