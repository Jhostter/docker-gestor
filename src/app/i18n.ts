"use client";
// Minimal, dependency-free translation. To add a language: create locales/<code>.ts with the same keys
// as es.ts (the compiler reports any missing key) and register it in `dicts` and `LANGS`.
import { useCallback, useSyncExternalStore } from "react";
import { es } from "./locales/es";
import { en } from "./locales/en";

export type Lang = "es" | "en";
export type Key = keyof typeof es;
export const LANGS: Lang[] = ["es", "en"];
const dicts: Record<Lang, Record<Key, string>> = { es, en };

let current: Lang | null = null;
const subs = new Set<() => void>();

function detect(): Lang {
  try { const s = localStorage.getItem("lang"); if (s === "es" || s === "en") return s; } catch { /* no storage available */ }
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}
export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  return (current ??= detect());
}
export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem("lang", l); } catch { /* no storage available */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

type Vars = Record<string, string | number>;
/** Translates `key`. `{name}` is substituted; "singular|plural" picks one according to `n`. */
export function tr(key: Key, vars: Vars = {}, lang: Lang = getLang()): string {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (s.includes("|") && typeof vars.n === "number") s = s.split("|")[vars.n === 1 ? 0 : 1];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
export const hasKey = (k: string): k is Key => k in es;

/** Hook for components: re-renders when the language changes. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "en" as Lang);
  const t = useCallback((key: Key, vars?: Vars) => tr(key, vars, lang), [lang]);
  return { t, lang };
}
