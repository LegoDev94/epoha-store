/**
 * Настройки площадки: то, что раньше требовало правки на сервере.
 * Уведомления, комиссия, доставка, срок удержания, ключ перевода.
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "./lang";
import { useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

interface Field { value?: string | number; set?: boolean; origin: "panel" | "env" | "default" }
interface Health {
  mode: "live" | "test";
  stripe: boolean; stripeWebhook: boolean; connectWebhook: boolean;
  telegram: boolean; email: boolean; translate: boolean;
}


export default function Settings({ api }: { api: Api }) {
  const toast = useToast();
  const { t } = useT();
  const ORIGIN: Record<string, string> = {
    panel: t("s.zadanoZdes"), env: t("s.izOkruzheniyaServera"), default: t("s.poUmolchaniyu"),
  };
  const [values, setValues] = useState<Record<string, Field> | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api("api/admin/settings")
      .then((d) => { setValues(d.values); setHealth(d.health); setDraft({}); })
      .catch((e) => toast.err(t("s.nastrojkiNeZagruzilis"), String(e.message)));
  }, [api, toast]);
  useEffect(load, [load]);

  const save = async () => {
    setBusy("save");
    try {
      const d = await api("api/admin/settings", { method: "POST", body: JSON.stringify(draft) });
      setValues(d.values);
      setHealth(d.health);
      setDraft({});
      toast.ok(t("s.nastrojkiSohraneny"));
    } catch (e) {
      toast.err(t("ui.saveFail"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  /* Переключение режима — заметное действие: меняется, куда уходят деньги */
  const switchMode = async (next: "live" | "test") => {
    if (next === health?.mode) return;
    if (next === "test" && !values?.stripeTestSecret?.set && !draft.stripeTestSecret)
      return toast.err(t("s.snachalaKlyuch"));
    if (!confirm(next === "test" ? t("s.podtverditPesochnicu") : t("s.podtverditBoevoj"))) return;
    setBusy("mode");
    try {
      const d = await api("api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ ...draft, stripeMode: next }),
      });
      setValues(d.values);
      setHealth(d.health);
      setDraft({});
      toast.ok(next === "test" ? t("s.vklyuchenaPesochnica") : t("s.vklyuchenBoevoj"));
    } catch (e) {
      toast.err(t("ui.saveFail"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const test = async (kind: "telegram" | "email") => {
    setBusy(kind);
    try {
      await api("api/admin/settings/test-notify", { method: "POST", body: JSON.stringify({ kind }) });
      toast.ok(kind === "telegram" ? t("s.soobschenieOtpravlenoV") : t("s.pismoOtpravleno"));
    } catch (e) {
      toast.err(t("s.kanalNeRabotaet"), String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  if (!values) return <p className="adm-hint" style={{ padding: 24 }}>…</p>;

  const val = (k: string) => (draft[k] !== undefined ? draft[k] : String(values[k]?.value ?? ""));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const dirty = Object.keys(draft).length > 0;

  const num = (k: string, label: string, hint: string, suffix?: string) => (
    <label className="adm-f" key={k}>
      <span>{label}</span>
      <div className="set-num">
        <input type="number" value={val(k)} onChange={set(k)} />
        {suffix && <i>{suffix}</i>}
      </div>
      <small className="adm-hint">{hint} · {ORIGIN[values[k]?.origin || "default"]}</small>
    </label>
  );

  const secret = (k: string, label: string, hint: string) => (
    <label className="adm-f" key={k}>
      <span>{label} {values[k]?.set && <em className="set-ok">{t("s.zadan")}</em>}</span>
      <input
        type="password"
        value={draft[k] ?? ""}
        onChange={set(k)}
        placeholder={values[k]?.set ? t("s.ostavtePustymNe") : t("s.neZadan")}
      />
      <small className="adm-hint">{hint} · {ORIGIN[values[k]?.origin || "default"]}</small>
    </label>
  );

  const text = (k: string, label: string, hint: string, placeholder = "") => (
    <label className="adm-f" key={k}>
      <span>{label}</span>
      <input value={val(k)} onChange={set(k)} placeholder={placeholder} />
      <small className="adm-hint">{hint}</small>
    </label>
  );

  const HEALTH: [keyof Health, string, string][] = [
    ["stripe", t("s.priemPlatezhej"), t("s.klyuchStripeZadan")],
    ["stripeWebhook", t("s.podtverzhdenieOplaty"), t("s.vebhukPloschadki")],
    ["connectWebhook", t("s.sobytiyaPartnerov"), t("s.vebhukConnect")],
    ["telegram", t("s.uvedomleniyaVTelegram"), t("s.zakazyPrihodyatV")],
    ["email", t("s.uvedomleniyaNaPochtu"), t("s.zakazyPrihodyatPismom")],
    ["translate", t("s.avtoperevodKartochek"), t("s.klyuchDeepseek")],
  ];

  return (
    <div className="mp">
      <header className="mp-head">
        <div>
          <h2>{t("s.nastrojkiPloschadki")}</h2>
          <p>{t("s.menyayutsyaBezPerezapuska")}</p>
        </div>
        {dirty && (
          <button className="adm-btn" onClick={save} disabled={busy === "save"}>
            {busy === "save" ? t("ed.saving") : t("s.sohranitIzmeneniya")}
          </button>
        )}
      </header>

      <div className="set-health">
        {HEALTH.map(([k, label, hint]) => (
          <div key={k} className={`set-h ${health?.[k] ? "on" : "off"}`}>
            <i aria-hidden="true">{health?.[k] ? "✓" : "!"}</i>
            <span><b>{label}</b><small>{health?.[k] ? hint : t("s.neNastroeno")}</small></span>
          </div>
        ))}
      </div>

      <div className="set-cols">
        <section className="mp-card">
          <h3>{t("s.uvedomleniyaOZakazah")}</h3>
          <p className="adm-hint">
            Пока канал не подключён, о новом заказе можно узнать только из этой панели.
          </p>
          {secret("telegramToken", t("s.tokenBotaTelegram"), t("s.poluchiteUBotfather"))}
          {text("telegramChat", "Chat ID", t("s.napishiteBotuI"), "123456789")}
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={() => test("telegram")} disabled={busy === "telegram"}>
            {busy === "telegram" ? t("s.otpravlyaem") : t("s.otpravitTestovoeSoobschenie")}
          </button>

          {secret("resendKey", t("s.klyuchResend"), t("s.dlyaPisemO"))}
          {text("orderEmail", t("s.pochtaDlyaZakazov"), t("s.kudaPrihodyatUvedomleniya"), "info@sofa.lv")}
          {text("orderFrom", t("s.otpravitel"), t("s.adresVPole"), "info@sofa.lv")}
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={() => test("email")} disabled={busy === "email"}>
            {busy === "email" ? t("s.otpravlyaem") : t("s.otpravitTestovoePismo")}
          </button>
        </section>

        <section className="mp-card">
          <h3>{t("s.rezhimStripe")}</h3>
          <div className={`set-mode set-mode-${health?.mode || "live"}`}>
            <div className="seg">
              <button className={health?.mode !== "test" ? "on" : ""} onClick={() => switchMode("live")}>
                {t("s.boevojRezhim")}
              </button>
              <button className={health?.mode === "test" ? "on" : ""} onClick={() => switchMode("test")}>
                {t("s.pesochnica")}
              </button>
            </div>
            <p className="adm-hint">
              {health?.mode === "test" ? t("s.pesochnicaOpisanie") : t("s.boevojOpisanie")}
            </p>
          </div>
          {secret("stripeTestSecret", t("s.testovyjKlyuch"), t("s.testovyjKlyuchGde"))}
          {secret("stripeTestWebhook", t("s.testovyjVebhuk"), t("s.testovyjVebhukGde"))}
          {secret("stripeTestConnectWebhook", t("s.testovyjVebhukConnect"), t("s.testovyjVebhukConnectGde"))}

          <h3>{t("s.usloviyaRaboty")}</h3>
          {num("commission", t("a.komissiyaPloschadki"), t("s.beretsyaSCeny"), "%")}
          {num("deliveryFee", t("s.dostavkaPoLatvii"), t("s.pokazyvaetsyaPokupatelyuPri"), "€")}
          {num("holdDays", t("s.uderzhanieVyplaty"), t("s.dnejPoslePeredachi"), t("s.dnej"))}
          {num("reserveMinutes", t("s.rezervNaOplatu"), t("s.skolkoDerzhimPredmet"), t("s.min"))}
          {text("pickupAddress", t("s.adresSamovyvoza"), t("s.pokazyvaetsyaPriOformlenii"))}

          <h3>{t("s.perevodKartochek")}</h3>
          {secret("deepseekKey", t("s.klyuchDeepseek2"), t("s.kartochkiPerevodyatsyaNa"))}
        </section>
      </div>

      {dirty && (
        <div className="bulk">
          <b>Изменено полей: {Object.keys(draft).length}</b>
          <button className="adm-btn adm-btn-sm" onClick={save} disabled={busy === "save"}>{t("ed.save")}</button>
          <button className="bulk-x" onClick={() => setDraft({})}>{t("s.otmenit")}</button>
        </div>
      )}
    </div>
  );
}
