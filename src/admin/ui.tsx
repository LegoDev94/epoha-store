/**
 * Рабочие мелочи панели: уведомления, подтверждения, состояния списков.
 *
 * Системные alert() и confirm() блокируют интерфейс, не дают увидеть,
 * что именно затрагивает действие, и в мобильном Safari могут быть
 * подавлены совсем — поэтому здесь свои.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "./lang";

/* ── уведомления ───────────────────────────────────────────────── */
type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  detail?: string;
}
interface ToastApi {
  ok: (text: string) => void;
  err: (text: string, detail?: string) => void;
  info: (text: string) => void;
}
const ToastCtx = createContext<ToastApi>({ ok: () => {}, err: () => {}, info: () => {} });
export const useToast = () => useContext(ToastCtx);

export function Toasts({ children }: { children: React.ReactNode }) {
  const { t: tr } = useT();
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, text: string, detail?: string) => {
    const id = ++seq.current;
    setList((s) => [...s, { id, kind, text, detail }]);
    /* Ошибку не прячем сама собой: её нужно прочитать и, возможно, скопировать */
    if (kind !== "err") setTimeout(() => setList((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      ok: (t) => push("ok", t),
      err: (t, d) => push("err", t, d),
      info: (t) => push("info", t),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="tst-wrap" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`tst tst-${t.kind}`}>
            <span className="tst-txt">
              {t.text}
              {t.detail && <i>{t.detail}</i>}
            </span>
            {t.kind === "err" && (
              <button
                className="tst-copy"
                onClick={() => navigator.clipboard?.writeText(`${t.text}${t.detail ? ` — ${t.detail}` : ""}`)}
              >
                копировать
              </button>
            )}
            <button className="tst-x" onClick={() => setList((s) => s.filter((x) => x.id !== t.id))} aria-label={tr("ui.close")}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── подтверждение необратимого ────────────────────────────────── */
export interface ConfirmOpts {
  title: string;
  body?: React.ReactNode;
  consequence?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function Confirm({
  opts,
  onYes,
  onNo,
}: {
  opts: ConfirmOpts;
  onYes: () => void;
  onNo: () => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onNo]);

  return (
    <div className="adm-modal-bg" onClick={onNo}>
      <div className="adm-modal adm-modal-sm cnf" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="adm-modal-body">
          <h2 className="cnf-h">{opts.title}</h2>
          {opts.body && <div className="cnf-body">{opts.body}</div>}
          {opts.consequence && <p className="cnf-conseq">{opts.consequence}</p>}
        </div>
        <footer className="adm-modal-foot">
          <button className="adm-btn adm-ghost" onClick={onNo}>{t("ed.cancel")}</button>
          <button
            className={`adm-btn${opts.danger ? " adm-danger-solid" : ""}`}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onYes();
            }}
          >
            {busy ? "…" : opts.confirmLabel || t("ui.confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Открыть подтверждение из любого места: const ask = useConfirm() */
export function useConfirmDialog() {
  const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    []
  );
  const node = state ? (
    <Confirm
      opts={state.opts}
      onYes={() => {
        state.resolve(true);
        setState(null);
      }}
      onNo={() => {
        state.resolve(false);
        setState(null);
      }}
    />
  ) : null;
  return { ask, node };
}

/* ── состояния списка ──────────────────────────────────────────── */

/** Скелетоны в размер карточек: вёрстка не прыгает при загрузке. */
export const Skeletons = ({ n = 4, h = 88 }: { n?: number; h?: number }) => (
  <div className="adm-list">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="skl" style={{ height: h }} />
    ))}
  </div>
);

export function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="errbox">
      <b>{t("ui.loadFail")}</b>
      <span>{text}</span>
      <button className="adm-btn adm-btn-sm" onClick={onRetry}>{t("ui.retry")}</button>
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="emptybox">
      <b>{title}</b>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  );
}

/** Пояснение к неочевидному термину. */
export const Hint = ({ text }: { text: string }) => (
  <span className="hintmark" tabIndex={0} data-hint={text} aria-label={text}>
    ?
  </span>
);

/* ── мелкие помощники ──────────────────────────────────────────── */
export const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** «2 минуты назад» — чтобы было видно, свежие ли данные на экране. */
export function ago(iso: number | null, t: (k: string, v?: Record<string, string | number>) => string) {
  if (!iso) return "";
  const sec = Math.round((Date.now() - iso) / 1000);
  if (sec < 45) return t("ui.justNow");
  if (sec < 90) return t("ui.minAgo");
  if (sec < 3600) return `${Math.round(sec / 60)} мин назад`;
  return `${Math.round(sec / 3600)} ч назад`;
}
