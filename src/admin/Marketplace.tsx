/**
 * Маркетплейс в панели: подключение партнёра и деньги.
 *
 * Кабинет партнёра говорит по-латышски (партнёры — латвийские компании),
 * администрирование площадки остаётся на русском.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { makeT, type T } from "../i18n";
import { useT } from "./lang";
import { Thumb, download, useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

const money = (cents: number | undefined) =>
  "€" + ((Math.round(cents || 0) / 100).toLocaleString("lv-LV", { minimumFractionDigits: 2 }));
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("lv-LV") : "—");

export interface Company {
  name?: string; form?: string; regNr?: string; vatNr?: string;
  address?: string; actualAddress?: string; country?: string;
  phone?: string; email?: string; contactPerson?: string; contactPosition?: string;
  iban?: string; goodsOrigin?: string; legalGoods?: boolean;
}
export interface StripeState {
  accountId?: string; chargesEnabled?: boolean; payoutsEnabled?: boolean;
  detailsSubmitted?: boolean; disabledReason?: string; currentlyDue?: string[];
  payoutInterval?: string; degraded?: string;
}
export interface Partner {
  id: string; login?: string; name: string; commission: number;
  stage: "draft" | "terms" | "stripe" | "review" | "active" | "suspended";
  status: string;
  company: Company;
  terms: { version: string; acceptedAt: string; sha256: string; representative?: string; ip?: string } | null;
  stripe: StripeState | null;
  holdDays?: number;
}

const STEPS = ["company", "terms", "stripe", "review"] as const;
const stageIndex = (stage: Partner["stage"]) =>
  stage === "draft" ? 0 : stage === "terms" ? 1 : stage === "stripe" ? 2 : stage === "review" ? 3 : 4;

/* ═══ кабинет партнёра ═══ */
export function PartnerCabinet({ api, onChanged }: { api: Api; onChanged?: () => void }) {
  /* Язык кабинета — общий с остальной панелью, переключатель живёт в шапке */
  const { lang } = useT();
  const t = useMemo(() => makeT(lang), [lang]);
  const [me, setMe] = useState<Partner | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api("api/partner/me").then(setMe).catch((e) => setErr(String(e.message)));
  }, [api]);
  useEffect(load, [load]);

  /* Возврат из Stripe — сразу перечитываем состояние счёта */
  useEffect(() => {
    if (!location.hash.includes("stripe=")) return;
    api("api/partner/stripe/sync", { method: "POST" })
      .then((d) => { setMe(d); onChanged?.(); })
      .catch(() => {})
      .finally(() => { location.hash = "#/admin"; });
  }, [api, onChanged]);

  if (err) return <p className="adm-err">{err}</p>;
  if (!me) return <p className="adm-hint">…</p>;
  if (me.stage === "active")
    return <PartnerActive t={t} api={api} onSync={load} />;

  const step = stageIndex(me.stage);
  return (
    <section className="mp">
      <header className="mp-head">
        <div>
          <h2>{t("partner.onboarding.title")}</h2>
          <p>{t("partner.onboarding.subtitle")}</p>
        </div>
      </header>

      <ol className="mp-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
            <i>{i < step ? "✓" : i + 1}</i>
            <div>
              <b>{t(`partner.onboarding.step.${s}.title`)}</b>
              <small>{t(`partner.onboarding.step.${s}.description`)}</small>
            </div>
          </li>
        ))}
      </ol>

      {me.stage === "suspended" && (
        <div className="mp-note mp-note-bad">
          <b>{t("partner.status.suspended.label")}</b>
          <p>{t("partner.status.suspended.description")}</p>
        </div>
      )}
      {me.stage === "draft" && <CompanyForm me={me} t={t} api={api} onSaved={(p) => { setMe(p); onChanged?.(); }} />}
      {me.stage === "terms" && <TermsStep me={me} t={t} api={api} onDone={(p) => { setMe(p); onChanged?.(); }} />}
      {me.stage === "stripe" && <StripeStep me={me} t={t} api={api} onSync={load} />}
      {me.stage === "review" && (
        <div className="mp-note">
          <b>{t("partner.status.pendingReview.label")}</b>
          <p>{t("partner.status.pendingReview.description")}</p>
          <p>{t("partner.review.note").replace("{email}", me.company?.email || "")}</p>
        </div>
      )}
    </section>
  );
}


/* ── шаг 1: реквизиты компании ── */
function CompanyForm({ me, t, api, onSaved }: { me: Partner; t: T; api: Api; onSaved: (p: Partner) => void }) {
  const [c, setC] = useState<Company>({ country: "LV", form: "company", ...(me.company || {}) });
  const [same, setSame] = useState(!me.company?.actualAddress);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setC({ ...c, [k]: e.target.value });

  const field = (k: keyof Company, req = false, hint?: string) => (
    <label className="adm-f" key={k}>
      <span>
        {t(`partner.form.${k === "regNr" ? "registrationNumber" : k === "vatNr" ? "vatNumber" : k === "name" ? "companyName" : k === "address" ? "legalAddress" : k === "actualAddress" ? "actualAddress" : k}.label`)}
        {req && " *"}
      </span>
      <input
        value={(c[k] as string) || ""}
        onChange={set(k)}
        placeholder={t(`partner.form.${k === "regNr" ? "registrationNumber" : k === "vatNr" ? "vatNumber" : k === "name" ? "companyName" : k}.placeholder`)}
      />
      {hint && <small className="adm-hint">{hint}</small>}
    </label>
  );

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const company = { ...c, actualAddress: same ? c.address : c.actualAddress };
      onSaved(await api("api/partner/company", { method: "POST", body: JSON.stringify({ company }) }));
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mp-card">
      <h3>{t("partner.form.section.company.title")}</h3>
      <div className="adm-grid">
        {field("name", true)}
        {field("regNr", true)}
        {field("vatNr", false, t("partner.form.vatNumber.hint"))}
      </div>
      {field("address", true)}
      <label className="adm-f adm-check">
        <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
        <span>{t("partner.form.actualAddress.sameAsLegal")}</span>
      </label>
      {!same && field("actualAddress")}

      <h3>{t("partner.form.section.contacts.title")}</h3>
      <div className="adm-grid">
        {field("phone", true)}
        {field("email", true)}
        {field("contactPerson", true)}
        {field("contactPosition")}
      </div>

      <h3>{t("partner.form.section.banking.title")}</h3>
      {field("iban", false, t("partner.form.iban.hint"))}

      <h3>{t("partner.form.section.goods.title")}</h3>
      <label className="adm-f">
        <span>{t("partner.form.goodsOrigin.label")}</span>
        <textarea
          rows={3}
          value={c.goodsOrigin || ""}
          onChange={set("goodsOrigin")}
          placeholder={t("partner.form.goodsOrigin.placeholder")}
        />
        <small className="adm-hint">{t("partner.form.goodsOrigin.hint")}</small>
      </label>
      <label className="adm-f adm-check">
        <input
          type="checkbox"
          checked={Boolean(c.legalGoods)}
          onChange={(e) => setC({ ...c, legalGoods: e.target.checked })}
        />
        <span>
          Apliecinu, ka pārdodu tikai likumīgi iegūtas preces, uz kurām man ir īpašuma vai
          pārdošanas tiesības.
        </span>
      </label>

      {err && <p className="adm-err">{err}</p>}
      <button className="adm-btn" onClick={save} disabled={busy}>
        {busy ? "…" : t("partner.form.continue")}
      </button>
    </div>
  );
}

/* ── шаг 2: договор ── */
function TermsStep({ me, t, api, onDone }: { me: Partner; t: T; api: Api; onDone: (p: Partner) => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const accept = async () => {
    if (!agreed) return setErr(t("partner.terms.checkboxRequired"));
    setBusy(true);
    setErr("");
    try {
      onDone(
        await api("api/partner/terms", {
          method: "POST",
          body: JSON.stringify({
            accepted: true,
            representative: {
              name: me.company?.contactPerson,
              email: me.company?.email,
              position: me.company?.contactPosition,
            },
          }),
        })
      );
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mp-card">
      <h3>{t("partner.terms.title")}</h3>
      <p className="adm-hint">
        <a href="#/legal/partner" target="_blank" rel="noopener noreferrer">
          {t("partner.terms.documentsLink")} →
        </a>
      </p>
      <label className="mp-consent">
        {/* Галочка не проставлена заранее: согласие должно быть действием */}
        <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErr(""); }} />
        <span>{t("partner.terms.checkbox")}</span>
      </label>
      {err && <p className="adm-err">{err}</p>}
      <button className="adm-btn mp-accept" onClick={accept} disabled={busy}>
        {busy ? t("partner.terms.submitting") : t("partner.terms.submitButton")}
      </button>
    </div>
  );
}

/* ── шаг 3: Stripe ── */
function StripeStep({ me, t, api, onSync }: { me: Partner; t: T; api: Api; onSync: () => void }) {
  const { t: tt } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const due = me.stripe?.currentlyDue || [];

  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      const { url } = await api("api/partner/stripe/link", { method: "POST" });
      location.href = url;
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(false);
    }
  };
  const degraded = me.stripe?.degraded;

  return (
    <div className="mp-card">
      <h3>{t("partner.stripe.title")}</h3>
      <p className="adm-hint">{t("partner.stripe.description")}</p>
      {me.stripe?.accountId && (
        <p className="mp-acct">
          {t("partner.stripe.connected")}: <code>{me.stripe.accountId}</code>
        </p>
      )}
      {due.length > 0 && (
        <div className="mp-note mp-note-warn">
          <b>{t("partner.status.stripeRequired.label")}</b>
          <p>{t("partner.status.stripeRequired.description")}</p>
          <ul>{due.slice(0, 6).map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      {err && <p className="adm-err">{err}</p>}
      {degraded && <p className="adm-err">{degraded}</p>}
      <div className="mp-btns">
        <button className="adm-btn" onClick={start} disabled={busy}>
          {busy ? "…" : me.stripe?.accountId ? t("partner.status.stripeRequired.action") : t("partner.stripe.button")}
        </button>
        <button className="adm-btn adm-ghost" onClick={onSync}>{tt("m.proveritStatus")}</button>
      </div>
    </div>
  );
}

/* ── активный партнёр: деньги ── */
interface PayoutRow {
  order: string; at: string; state: string; status: string;
  deliveredAt: string | null; releaseAt: string | null; payoutAt: string | null;
  grossCents: number; commissionCents: number; stripeFeeCents: number; netCents: number;
  items: { n: string; title: string; img: string; price: number }[];
}

function PartnerActive({ t, api, onSync }: { t: T; api: Api; onSync: () => void }) {
  const toast = useToast();
  const { t: tt } = useT();
  const [data, setData] = useState<{ buckets: Record<string, number>; rows: PayoutRow[]; balance: any; holdDays: number } | null>(null);
  useEffect(() => {
    api("api/partner/payouts").then(setData).catch(() => {});
  }, [api]);

  const openStripe = async () => {
    try {
      const { url } = await api("api/partner/stripe/dashboard");
      open(url, "_blank", "noopener");
    } catch (e) {
      alert(String((e as Error).message));
    }
  };

  const b = data?.buckets || {};
  const cards: [string, number, string][] = [
    [t("payout.status.held.label"), b.held || 0, "held"],
    [t("payout.status.available.label"), b.available || 0, "available"],
    [t("payout.status.paid.label"), b.paid || 0, "paid"],
  ];

  return (
    <section className="mp">
      <header className="mp-head">
        <div>
          <h2>{t("payout.section.title")}</h2>
          <p>
            {t("partner.status.active.description")} · {t("payout.status.held.description")}
          </p>
        </div>
        <div className="mp-head-side">
          <button className="adm-btn adm-ghost" onClick={openStripe}>Stripe →</button>
          <button
            className="adm-btn adm-ghost"
            onClick={() =>
              download("api/partner/terms.pdf", "sofa-lv-noteikumi.pdf").catch((e) =>
                toast.err(t("m.pdfNeSkachalsya"), String(e.message))
              )
            }
          >
            PDF
          </button>
        </div>
      </header>

      <div className="mp-cards">
        {cards.map(([label, cents, key]) => (
          <div key={key} className={`mp-money mp-money-${key}`}>
            <span>{label}</span>
            <b>{money(cents)}</b>
          </div>
        ))}
        {data?.balance && !data.balance.error && (
          <div className="mp-money mp-money-bal">
            <span>{tt("m.stripeDostupnoObrabotka")}</span>
            <b>{money(data.balance.available)} / {money(data.balance.pending)}</b>
          </div>
        )}
      </div>

      <table className="mp-table">
        <thead>
          <tr>
            <th>{tt("m.thZakaz")}</th><th>{tt("m.thTovar")}</th><th>{tt("m.thSumma")}</th><th>{tt("m.thKomissiya")}</th>
            <th>{tt("m.thVam")}</th><th>{tt("m.thPeredan")}</th><th>{tt("m.thVyplata")}</th>
          </tr>
        </thead>
        <tbody>
          {(data?.rows || []).map((r) => (
            <tr key={r.order}>
              <td><b>{r.order}</b><small>{date(r.at)}</small></td>
              <td className="mp-items">
                {r.items.map((i, k) => (
                  <span key={k}>{i.img && <Thumb src={i.img} />}№{i.n} {i.title}</span>
                ))}
              </td>
              <td>{money(r.grossCents)}</td>
              <td>−{money(r.commissionCents)}</td>
              <td><b>{money(r.netCents)}</b></td>
              <td>{date(r.deliveredAt)}</td>
              <td><PayoutBadge state={r.state} t={t} releaseAt={r.releaseAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data?.rows?.length && <p className="adm-hint">{tt("m.poka NetProdazh".replace(" ", ""))}</p>}
      <button className="adm-btn adm-ghost" onClick={onSync}>{tt("m.obnovit")}</button>
    </section>
  );
}

export function PayoutBadge({ state, t, releaseAt }: { state: string; t: T; releaseAt?: string | null }) {
  const label =
    state === "held" ? t("payout.status.held.label")
    : state === "available" ? t("payout.status.available.label")
    : state === "paid" ? t("payout.status.paid.label")
    : state === "refunded" ? t("payout.status.refunded.label")
    : state === "disputed" ? t("payout.status.disputed.label")
    : "—";
  return (
    <span className={`mp-badge mp-badge-${state}`}>
      {label}
      {state === "held" && releaseAt && <i>{date(releaseAt)}</i>}
    </span>
  );
}

/* ═══ администрирование партнёров ═══ */
export function AdminPartners({ api, onChanged }: { api: Api; onChanged: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [list, setList] = useState<Partner[]>([]);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api("api/admin/sellers").then(setList).catch(() => {});
  }, [api]);
  useEffect(load, [load]);

  const act = async (id: string, url: string, body?: any) => {
    setBusy(id);
    try {
      await api(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      load();
      onChanged();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const STAGE: Record<string, string> = {
    draft: t("m.zapolnyaetAnketu"), terms: t("m.nePrinyalUsloviya"), stripe: t("m.prohoditStripe"),
    review: t("m.zhdetProverki"), active: t("m.torguet"), suspended: t("m.priostanovlen"),
  };

  return (
    <div className="mp-admin">
      {list.map((p) => (
        <article key={p.id} className={`mp-partner mp-stage-${p.stage}`}>
          <header onClick={() => setOpen(open === p.id ? null : p.id)}>
            <div>
              <b>{p.company?.name || p.name}</b>
              <small>
                {p.company?.regNr ? `Reģ. ${p.company.regNr} · ` : ""}
                {p.login} · комиссия {p.commission}%
              </small>
            </div>
            <span className={`mp-badge mp-badge-${p.stage}`}>{STAGE[p.stage] || p.stage}</span>
          </header>

          {open === p.id && (
            <div className="mp-partner-body">
              <div className="mp-cols">
                <div>
                  <h4>{t("m.rekvizity")}</h4>
                  {p.company?.name ? (
                    <dl>
                      <div><dt>{t("ed.title")}</dt><dd>{p.company.name}</dd></div>
                      <div><dt>{t("m.regNomer")}</dt><dd>{p.company.regNr || "—"}</dd></div>
                      <div><dt>PVN</dt><dd>{p.company.vatNr || t("m.net")}</dd></div>
                      <div><dt>{t("m.adres")}</dt><dd>{p.company.address || "—"}</dd></div>
                      <div><dt>{t("m.kontakt")}</dt><dd>{p.company.contactPerson} · {p.company.phone} · {p.company.email}</dd></div>
                      <div><dt>IBAN</dt><dd>{p.company.iban || "—"}</dd></div>
                      <div><dt>{t("nav.goods")}</dt><dd>{p.company.goodsOrigin || "—"}</dd></div>
                    </dl>
                  ) : (
                    <p className="adm-hint">{t("m.anketaNeZapolnena")}</p>
                  )}
                </div>
                <div>
                  <h4>{t("m.dogovor")}</h4>
                  {p.terms ? (
                    <dl>
                      <div><dt>{t("m.versiya")}</dt><dd>{p.terms.version}</dd></div>
                      <div><dt>{t("m.prinyat")}</dt><dd>{new Date(p.terms.acceptedAt).toLocaleString("ru-RU")}</dd></div>
                      <div><dt>IP</dt><dd>{p.terms.ip || "—"}</dd></div>
                      <div><dt>{t("m.predstavitel")}</dt><dd>{p.terms.representative || "—"}</dd></div>
                      <div><dt>SHA-256</dt><dd className="mp-hash">{p.terms.sha256}</dd></div>
                    </dl>
                  ) : (
                    <p className="adm-hint">{t("m.nePrinyat")}</p>
                  )}
                  {p.terms && (
                    <button
                      className="adm-btn adm-ghost"
                      onClick={() =>
                        download(`api/admin/sellers/${p.id}/terms.pdf`, `sofa-lv-${p.id}-noteikumi.pdf`).catch((e) =>
                          toast.err(t("m.pdfNeSkachalsya"), String(e.message))
                        )
                      }
                    >
                      {t("m.skachatPdf")}
                    </button>
                  )}

                  <h4>Stripe</h4>
                  {p.stripe?.accountId ? (
                    <dl>
                      <div><dt>{t("m.schet")}</dt><dd><code>{p.stripe.accountId}</code></dd></div>
                      <div><dt>{t("s.priemPlatezhej")}</dt><dd>{p.stripe.chargesEnabled ? t("m.da") : t("m.net")}</dd></div>
                      <div><dt>{t("nav.payouts")}</dt><dd>{p.stripe.payoutsEnabled ? t("m.da") : t("m.net")} · {p.stripe.payoutInterval || "?"}</dd></div>
                      {p.stripe.disabledReason && <div><dt>{t("m.prichinaBloka")}</dt><dd>{p.stripe.disabledReason}</dd></div>}
                      {p.stripe.currentlyDue?.length ? (
                        <div><dt>{t("m.stripeZhdet")}</dt><dd>{p.stripe.currentlyDue.join(", ")}</dd></div>
                      ) : null}
                      {p.stripe.degraded && (
                        <div><dt>{t("m.vnimanie")}</dt><dd className="mp-warn">выплатами управляет Stripe: {p.stripe.degraded}</dd></div>
                      )}
                    </dl>
                  ) : (
                    <p className="adm-hint">{t("m.schetNeSozdan")}</p>
                  )}
                </div>
              </div>

              <div className="mp-btns">
                <button className="adm-btn adm-ghost" onClick={() => act(p.id, `api/admin/sellers/${p.id}/sync`)} disabled={busy === p.id}>
                  Обновить из Stripe
                </button>
                {p.stage !== "active" && (
                  <button className="adm-btn" onClick={() => act(p.id, `api/admin/sellers/${p.id}/status`, { status: "active" })} disabled={busy === p.id}>
                    Допустить к торговле
                  </button>
                )}
                {p.stage === "active" && (
                  <button className="adm-btn adm-danger" onClick={() => act(p.id, `api/admin/sellers/${p.id}/status`, { status: "suspended" })} disabled={busy === p.id}>
                    Приостановить
                  </button>
                )}
                {p.stage === "suspended" && (
                  <button className="adm-btn" onClick={() => act(p.id, `api/admin/sellers/${p.id}/status`, { status: "review" })} disabled={busy === p.id}>
                    Вернуть на проверку
                  </button>
                )}
              </div>
            </div>
          )}
        </article>
      ))}
      {!list.length && <p className="adm-hint">{t("m.prodavcovPokaNet")}</p>}
    </div>
  );
}

/* ═══ выплаты партнёрам ═══ */
export function AdminPayouts({ api }: { api: Api }) {
  const { t } = useT();
  const [data, setData] = useState<{ holdDays: number; rows: any[] } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api("api/admin/payouts").then(setData).catch(() => {});
  }, [api]);
  useEffect(load, [load]);

  const pay = async (id: string, name: string, sum: number) => {
    if (!confirm(`Выплатить ${name} ${money(sum)}?`)) return;
    setBusy(id);
    try {
      const r = await api(`api/admin/payouts/${id}`, { method: "POST" });
      alert(
        r.partial
          ? `Выплачено ${money(r.payout.amount)} — часть суммы ещё не доступна в Stripe.`
          : `Выплата ${money(r.payout.amount)} отправлена. Заказы: ${r.orders.join(", ")}`
      );
      load();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mp-admin">
      <p className="adm-hint">
        Деньги покупателя лежат на счёте партнёра в Stripe, но уходят на его банк только по этой
        кнопке — не раньше, чем пройдут {data?.holdDays ?? 14} дней после передачи товара.
      </p>
      {(data?.rows || []).map((r) => (
        <article key={r.id} className="mp-partner">
          <header>
            <div>
              <b>{r.name}</b>
              <small>
                {r.accountId ? <code>{r.accountId}</code> : t("m.netSchetaStripe")}
                {r.iban ? ` · ${r.iban}` : ""}
              </small>
            </div>
            <span className={`mp-badge mp-badge-${r.stage}`}>{r.stage}</span>
          </header>
          <div className="mp-partner-body">
            <div className="mp-cards">
              <div className="mp-money mp-money-held"><span>{t("m.uderzhano")}</span><b>{money(r.buckets.held)}</b></div>
              <div className="mp-money mp-money-available"><span>{t("a.kVyplate")}</span><b>{money(r.buckets.available)}</b></div>
              <div className="mp-money mp-money-paid"><span>{t("m.vyplacheno")}</span><b>{money(r.buckets.paid)}</b></div>
              {r.balance && !r.balance.error && (
                <div className="mp-money mp-money-bal">
                  <span>{t("m.stripeDostupnoV")}</span>
                  <b>{money(r.balance.available)} / {money(r.balance.pending)}</b>
                </div>
              )}
              {r.balance?.error && <div className="mp-money mp-money-bad"><span>Stripe</span><b>{r.balance.error}</b></div>}
            </div>

            {r.orders?.length > 0 && (
              <table className="mp-table">
                <thead><tr><th>{t("stt.order")}</th><th>{t("m.tovar")}</th><th>{t("a.kVyplate")}</th><th>{t("m.peredan")}</th><th>{t("m.srok")}</th><th>{t("m.sostoyanie")}</th></tr></thead>
                <tbody>
                  {r.orders.map((o: PayoutRow) => (
                    <tr key={o.order}>
                      <td><b>{o.order}</b></td>
                      <td className="mp-items">{o.items.map((i, k) => <span key={k}>№{i.n} {i.title}</span>)}</td>
                      <td>{money(o.netCents)}</td>
                      <td>{date(o.deliveredAt)}</td>
                      <td>{date(o.releaseAt)}</td>
                      <td>{o.state === "available" ? t("m.gotovo") : o.state === "disputed" ? t("m.spor") : t("m.uderzhano2")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mp-btns">
              <button
                className="adm-btn"
                disabled={busy === r.id || !r.buckets.available || !r.accountId}
                onClick={() => pay(r.id, r.name, r.buckets.available)}
              >
                {busy === r.id ? "…" : `Выплатить ${money(r.buckets.available)}`}
              </button>
            </div>
          </div>
        </article>
      ))}
      {!data?.rows?.length && <p className="adm-hint">{t("m.partnerovSProdazhami")}</p>}
    </div>
  );
}
