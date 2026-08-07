/**
 * Язык панели. По умолчанию латышский — площадка и партнёры латвийские,
 * русский и английский остаются в переключателе.
 *
 * Словарь живёт в lang-dict.ts: ключ → три языка.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Lang } from "../data/catalog";
import { DICT } from "./lang-dict";

export const ADMIN_LANGS: { code: Lang; label: string }[] = [
  { code: "lv", label: "LV" },
  { code: "en", label: "EN" },
  { code: "ru", label: "RU" },
];

const KEY = "sofa-admin-lang";
const stored = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "lv" || v === "en" || v === "ru") return v;
  } catch {
    /* приватный режим браузера — остаёмся на умолчании */
  }
  return "lv";
};

export type AdminT = (key: string, vars?: Record<string, string | number>) => string;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: AdminT;
}
const LangCtx = createContext<Ctx>({ lang: "lv", setLang: () => {}, t: (k) => k });
export const useT = () => useContext(LangCtx);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(stored);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<AdminT>(
    (key, vars) => {
      const row = DICT[key];
      let s = row ? row[lang] ?? row.lv ?? key : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

/** Переключатель в шапке панели. */
export function LangSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="mp-lang adm-lang">
      {ADMIN_LANGS.map((l) => (
        <button key={l.code} className={lang === l.code ? "on" : ""} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

/* ── форматирование по языку ────────────────────────────────────── */
const locale: Record<Lang, string> = { lv: "lv-LV", en: "en-GB", ru: "ru-RU" };

export const useFmt = () => {
  const { lang } = useT();
  return useMemo(() => {
    const loc = locale[lang];
    return {
      /** Евро из обычного числа */
      eur: (n: number | undefined) =>
        "€" + (Math.round((n || 0) * 100) / 100).toLocaleString(loc, { maximumFractionDigits: 2 }),
      /** Евро из центов */
      cents: (c: number | undefined) =>
        "€" + ((c || 0) / 100).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      date: (s?: string | null) => (s ? new Date(s).toLocaleDateString(loc) : "—"),
      dateTime: (s?: string | null) =>
        s ? new Date(s).toLocaleString(loc, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
      time: (s?: string | null) => (s ? new Date(s).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : ""),
      loc,
    };
  }, [lang]);
};
