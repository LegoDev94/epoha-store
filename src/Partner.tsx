/**
 * Страница «стать партнёром»: как устроено сотрудничество и заявка.
 *
 * Раньше партнёра заводил только владелец руками — с улицы попасть на
 * площадку было нельзя. Здесь компания видит условия и оставляет
 * заявку; она уходит владельцу письмом и остаётся в панели.
 *
 * Форма открыта всему интернету, поэтому в ней есть скрытое поле
 * «site»: человек его не видит и не заполняет, а робот заполняет —
 * такие заявки сервер тихо отбрасывает.
 */
import { useEffect, useState } from "react";
import type { Lang } from "./data/catalog";
import type { T } from "./i18n";

interface Platform {
  commission?: number;
  holdDays?: number;
}

const FIELDS = [
  { key: "company", need: true, wide: false },
  { key: "regNr", need: false, wide: false },
  { key: "person", need: true, wide: false },
  { key: "email", need: true, wide: false, type: "email" },
  { key: "phone", need: false, wide: false, type: "tel" },
  { key: "goods", need: false, wide: true },
  { key: "link", need: false, wide: true },
] as const;

type Values = Record<string, string>;

export function PartnerPage({ t, lang, go }: { t: T; lang: Lang; go: (p: string) => void }) {
  const [v, setV] = useState<Values>({});
  const [message, setMessage] = useState("");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [plat, setPlat] = useState<Platform>({});

  useEffect(() => {
    document.title = t("pt.meta.title");
    fetch("api/platform")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlat(d))
      .catch(() => {});
  }, [t]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const missing = (k: string) => {
    const need = FIELDS.find((f) => f.key === k)?.need;
    if (!need) return false;
    const val = (v[k] || "").trim();
    if (!val) return true;
    return k === "email" && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(val);
  };
  const bad = FIELDS.some((f) => missing(f.key));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(FIELDS.map((f) => [f.key, true])));
    if (bad || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("api/partner-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, message, site, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error === "EMAIL" ? t("pt.form.badEmail") : t("pt.form.error"));
      setDone(true);
      scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(String((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const steps = [1, 2, 3, 4];
  const terms: [string, string][] = [
    [t("pt.terms.commissionLabel"), t("pt.terms.commissionValue").replace("{n}", String(plat.commission ?? 20))],
    [t("pt.terms.payoutLabel"), t("pt.terms.payoutValue").replace("{n}", String(plat.holdDays ?? 14))],
    [t("pt.terms.sellerLabel"), t("pt.terms.sellerValue")],
    [t("pt.terms.deliveryLabel"), t("pt.terms.deliveryValue")],
    [t("pt.terms.claimsLabel"), t("pt.terms.claimsValue")],
  ];

  return (
    <div className="pg">
      <div className="wrap wrap-narrow">
        <nav className="crumbs">
          <a href="/" onClick={(e) => { e.preventDefault(); go("/"); }}>{t("crumb.home")}</a>
          <span>/</span>
          <b>{t("pt.hero.kicker")}</b>
        </nav>

        {done ? (
          <section className="ptn-done">
            <h1>{t("pt.done.title")}</h1>
            <p>{t("pt.done.text")}</p>
            <button className="btn-brass" onClick={() => go("/")}>{t("favs.go")}</button>
          </section>
        ) : (
          <>
            <header className="ptn-hero">
              <span className="ptn-kicker">{t("pt.hero.kicker")}</span>
              <h1>{t("pt.hero.heading")}</h1>
              <p>{t("pt.hero.lead")}</p>
            </header>

            <section className="ptn-steps">
              {steps.map((n) => (
                <div className="ptn-step" key={n}>
                  <i>{n}</i>
                  <b>{t(`pt.step${n}.title`)}</b>
                  <p>{t(`pt.step${n}.text`)}</p>
                </div>
              ))}
            </section>

            <section className="ptn-terms">
              <h2>{t("pt.terms.title")}</h2>
              <dl>
                {terms.map(([k, val]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="ptn-terms-note">
                {t("pt.terms.note")}{" "}
                <a href="/legal/partner" onClick={(e) => { e.preventDefault(); go("/legal/partner"); }}>
                  {t("legal.partner")}
                </a>
              </p>
            </section>

            <section className="ptn-form" id="pieteikums">
              <h2>{t("pt.form.title")}</h2>
              <p className="ptn-form-lead">{t("pt.form.lead")}</p>
              <form onSubmit={submit} noValidate>
                <div className="ptn-grid">
                  {FIELDS.map((f) => (
                    <label key={f.key} className={f.wide ? "ptn-wide" : ""}>
                      <span>
                        {t(`pt.form.${f.key}`)}
                        {!f.need && <i> · {t("pt.form.optional")}</i>}
                      </span>
                      <input
                        type={"type" in f ? f.type : "text"}
                        value={v[f.key] || ""}
                        onChange={set(f.key)}
                        onBlur={() => setTouched((s) => ({ ...s, [f.key]: true }))}
                        placeholder={t(`pt.form.${f.key}Hint`)}
                        className={touched[f.key] && missing(f.key) ? "bad" : ""}
                        autoComplete={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "off"}
                      />
                    </label>
                  ))}
                  <label className="ptn-wide">
                    <span>
                      {t("pt.form.message")}
                      <i> · {t("pt.form.optional")}</i>
                    </span>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t("pt.form.messageHint")}
                    />
                  </label>
                </div>

                {/* Ловушка для роботов: людям это поле не показывается */}
                <input
                  className="ptn-trap"
                  tabIndex={-1}
                  autoComplete="off"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  aria-hidden="true"
                />

                {err && <p className="ptn-err">{err}</p>}
                <button className="btn-brass" disabled={busy}>
                  {busy ? t("pt.form.sending") : t("pt.form.submit")}
                </button>
                <p className="ptn-consent">
                  {t("pt.form.consent")}{" "}
                  <a href="/legal/privacy" onClick={(e) => { e.preventDefault(); go("/legal/privacy"); }}>
                    {t("legal.privacy")}
                  </a>
                </p>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
