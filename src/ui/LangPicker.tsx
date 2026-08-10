/**
 * Выбор языка: флаг и код, а список — по нажатию.
 *
 * Пять языков в ряд занимали на телефоне целую строку и оттесняли
 * корзину. Свёрнутый вид — один флаг с кодом; в раскрытом списке у
 * каждого языка название на нём самом, чтобы литовец узнал «Lietuvių»
 * даже на латышской витрине.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Flag } from "./Flag";
import "./select.css";
import "./lang-picker.css";

export interface LangOption {
  code: string;
  label: string;
  full: string;
}

export function LangPicker({
  value,
  options,
  onChange,
  title,
  className = "",
}: {
  value: string;
  options: LangOption[];
  onChange: (code: any) => void;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.code === value)));
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.code === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("mousedown", onDown);
    return () => removeEventListener("mousedown", onDown);
  }, [open]);

  /* Список рядом с низом окна разворачивается вверх */
  useLayoutEffect(() => {
    if (!open || !box.current || !list.current) return;
    const btn = box.current.getBoundingClientRect();
    const h = list.current.offsetHeight;
    setUp(btn.bottom + h + 16 > innerHeight && btn.top - h - 16 > 0);
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      setActive(Math.max(0, options.findIndex((o) => o.code === value)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active].code);
    }
  };

  return (
    <div ref={box} className={`sel lp ${className}`.trim()} onKeyDown={onKey}>
      <button
        type="button"
        className="sel-btn lp-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={title || current.full}
        title={title || current.full}
        onClick={() => setOpen(!open)}
      >
        <Flag code={current.code} />
        <span className="lp-code">{current.label}</span>
        <i className="sel-arrow" aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={list}
          className={`sel-list lp-list${up ? " up" : ""}`}
          role="listbox"
          aria-activedescendant={`lp-${options[active]?.code}`}
        >
          {options.map((o, i) => (
            <li
              key={o.code}
              id={`lp-${o.code}`}
              role="option"
              aria-selected={o.code === value}
              className={`sel-opt${o.code === value ? " on" : ""}${i === active ? " hover" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.code)}
            >
              <Flag code={o.code} />
              <span className="lp-name">{o.full}</span>
              <span className="lp-code lp-code-dim">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
