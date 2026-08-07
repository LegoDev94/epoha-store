/**
 * Настройки площадки: то, что раньше требовало правки на сервере.
 * Уведомления, комиссия, доставка, срок удержания, ключ перевода.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "./ui";

type Api = (url: string, opts?: RequestInit) => Promise<any>;

interface Field { value?: string | number; set?: boolean; origin: "panel" | "env" | "default" }
interface Health {
  stripe: boolean; stripeWebhook: boolean; connectWebhook: boolean;
  telegram: boolean; email: boolean; translate: boolean;
}

const ORIGIN: Record<string, string> = { panel: "задано здесь", env: "из окружения сервера", default: "по умолчанию" };

export default function Settings({ api }: { api: Api }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, Field> | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api("api/admin/settings")
      .then((d) => { setValues(d.values); setHealth(d.health); setDraft({}); })
      .catch((e) => toast.err("Настройки не загрузились", String(e.message)));
  }, [api, toast]);
  useEffect(load, [load]);

  const save = async () => {
    setBusy("save");
    try {
      const d = await api("api/admin/settings", { method: "POST", body: JSON.stringify(draft) });
      setValues(d.values);
      setHealth(d.health);
      setDraft({});
      toast.ok("Настройки сохранены");
    } catch (e) {
      toast.err("Не сохранилось", String((e as Error).message));
    } finally {
      setBusy("");
    }
  };

  const test = async (kind: "telegram" | "email") => {
    setBusy(kind);
    try {
      await api("api/admin/settings/test-notify", { method: "POST", body: JSON.stringify({ kind }) });
      toast.ok(kind === "telegram" ? "Сообщение отправлено в Telegram" : "Письмо отправлено");
    } catch (e) {
      toast.err("Канал не работает", String((e as Error).message));
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
      <span>{label} {values[k]?.set && <em className="set-ok">задан</em>}</span>
      <input
        type="password"
        value={draft[k] ?? ""}
        onChange={set(k)}
        placeholder={values[k]?.set ? "••••••••  (оставьте пустым — не менять)" : "не задан"}
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
    ["stripe", "Приём платежей", "ключ Stripe задан на сервере"],
    ["stripeWebhook", "Подтверждение оплаты", "вебхук площадки"],
    ["connectWebhook", "События партнёров", "вебхук Connect"],
    ["telegram", "Уведомления в Telegram", "заказы приходят в чат"],
    ["email", "Уведомления на почту", "заказы приходят письмом"],
    ["translate", "Автоперевод карточек", "ключ DeepSeek"],
  ];

  return (
    <div className="mp">
      <header className="mp-head">
        <div>
          <h2>Настройки площадки</h2>
          <p>Меняются без перезапуска сервера. Ключи можно оставить в окружении — тогда поле показывает «из окружения сервера».</p>
        </div>
        {dirty && (
          <button className="adm-btn" onClick={save} disabled={busy === "save"}>
            {busy === "save" ? "Сохранение…" : "Сохранить изменения"}
          </button>
        )}
      </header>

      <div className="set-health">
        {HEALTH.map(([k, label, hint]) => (
          <div key={k} className={`set-h ${health?.[k] ? "on" : "off"}`}>
            <i aria-hidden="true">{health?.[k] ? "✓" : "!"}</i>
            <span><b>{label}</b><small>{health?.[k] ? hint : "не настроено"}</small></span>
          </div>
        ))}
      </div>

      <div className="set-cols">
        <section className="mp-card">
          <h3>Уведомления о заказах</h3>
          <p className="adm-hint">
            Пока канал не подключён, о новом заказе можно узнать только из этой панели.
          </p>
          {secret("telegramToken", "Токен бота Telegram", "получите у @BotFather")}
          {text("telegramChat", "Chat ID", "напишите боту и возьмите id из @userinfobot", "123456789")}
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={() => test("telegram")} disabled={busy === "telegram"}>
            {busy === "telegram" ? "Отправляем…" : "Отправить тестовое сообщение"}
          </button>

          {secret("resendKey", "Ключ Resend", "для писем о заказах")}
          {text("orderEmail", "Почта для заказов", "куда приходят уведомления", "info@sofa.lv")}
          {text("orderFrom", "Отправитель", "адрес в поле «от кого»", "info@sofa.lv")}
          <button className="adm-btn adm-ghost adm-btn-sm" onClick={() => test("email")} disabled={busy === "email"}>
            {busy === "email" ? "Отправляем…" : "Отправить тестовое письмо"}
          </button>
        </section>

        <section className="mp-card">
          <h3>Условия работы</h3>
          {num("commission", "Комиссия площадки", "берётся с цены товара новых партнёров", "%")}
          {num("deliveryFee", "Доставка по Латвии", "показывается покупателю при оформлении", "€")}
          {num("holdDays", "Удержание выплаты", "дней после передачи товара покупателю", "дней")}
          {num("reserveMinutes", "Резерв на оплату", "сколько держим предмет, пока покупатель платит", "мин")}
          {text("pickupAddress", "Адрес самовывоза", "показывается при оформлении заказа")}

          <h3>Перевод карточек</h3>
          {secret("deepseekKey", "Ключ DeepSeek", "карточки переводятся на три языка при сохранении")}
        </section>
      </div>

      {dirty && (
        <div className="bulk">
          <b>Изменено полей: {Object.keys(draft).length}</b>
          <button className="adm-btn adm-btn-sm" onClick={save} disabled={busy === "save"}>Сохранить</button>
          <button className="bulk-x" onClick={() => setDraft({})}>отменить</button>
        </div>
      )}
    </div>
  );
}
