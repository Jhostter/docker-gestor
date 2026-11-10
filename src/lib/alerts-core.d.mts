export type Lang = "es" | "en";
export type Rule = "died" | "oom" | "unhealthy" | "restartLoop" | "cpu" | "memory";
export type AlertRule = Rule | "recovered" | "test";
export type AlertsConfig = {
  enabled: boolean; lang: Lang;
  rules: {
    died: { enabled: boolean }; oom: { enabled: boolean }; unhealthy: { enabled: boolean };
    restartLoop: { enabled: boolean; count: number; minutes: number };
    cpu: { enabled: boolean; percent: number; minutes: number };
    memory: { enabled: boolean; percent: number; minutes: number };
  };
  cooldownMinutes: number;
  channels: {
    browser: { enabled: boolean };
    telegram: { enabled: boolean; token: string; chatId: string };
    webhook: { enabled: boolean; url: string; format: "json" | "text"; authorization: string };
  };
};
export type Alert = { ts: number; rule: AlertRule; name: string; image?: string; vars?: Record<string, string | number> };
export type DockerEventInfo = { action: string; id: string; name: string; image: string; exitCode?: string };
export const SUPPRESS_MS: number;
export const DEFAULTS: AlertsConfig;
export class ConfigError extends Error { code: string; constructor(code: string); }
export function normalizeConfig(input?: unknown, current?: AlertsConfig): AlertsConfig;
export function publicConfig(cfg: AlertsConfig): unknown;
export function parseDockerEvent(raw: unknown): DockerEventInfo | null;
export function formatAlert(alert: Alert, lang?: Lang, host?: string): string;
export class AlertEngine {
  constructor(o: { getConfig: () => AlertsConfig; emit: (a: Alert) => void; now?: () => number; schedule?: (f: () => void, ms: number) => unknown; cancel?: (h: unknown) => void; sampleMs?: number });
  onEvent(e: DockerEventInfo): void;
  onSamples(snaps: { name: string; cpu: number; mem: number; limit: number }[]): void;
}
