/**
 * Фотография товара: браузер сам выбирает подходящий размер и формат.
 *
 * Одно и то же фото живёт в плитке каталога (~320 px), на странице
 * товара (~900 px) и в лупе (до 1600 px). Раньше во всех трёх местах
 * грузился оригинал — на плитке это 165 КБ вместо 7.
 *
 * Пока варианты не готовы (или сервер отдаёт статику), показываем
 * исходный файл: разметка остаётся рабочей в любом случае.
 */
import { useState } from "react";

/** Ширины должны совпадать с белым списком на сервере. */
const WIDTHS = [160, 320, 640, 960, 1280, 1600];
const AVIF_FROM = 640;
const V = "v1";

/** Размеры и основной цвет приходят вместе с товаром. */
export interface PhotoMeta {
  w: number;
  h: number;
  tone: string;
}

const stem = (src: string) => (src.split("/").pop() || "").replace(/\.[^.]+$/, "");
const isLocal = (src: string) => src.startsWith("/uploads/");

const srcset = (src: string, fmt: "webp" | "avif", max: number) =>
  WIDTHS.filter((w) => w <= max && (fmt === "webp" || w >= AVIF_FROM))
    .map((w) => `/i/${V}/w${w}/${stem(src)}.${fmt} ${w}w`)
    .join(", ");

export function Photo({
  src,
  alt,
  sizes,
  meta,
  max = 1600,
  priority = false,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  /** Сколько места фото займёт на экране — по этому браузер выбирает файл */
  sizes: string;
  meta?: PhotoMeta;
  /** Дальше этой ширины варианты не нужны */
  max?: number;
  /** Главное фото экрана: грузим первым и не откладываем */
  priority?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const optimized = isLocal(src);

  const img = (
    <img
      src={optimized ? `/i/${V}/w${Math.min(max, 960)}/${stem(src)}.webp` : src}
      /* Исходник остаётся запасным: если обработка не удалась, сервер
         перенаправит на него, и фото всё равно покажется. */
      srcSet={optimized ? srcset(src, "webp", max) : undefined}
      sizes={optimized ? sizes : undefined}
      alt={alt}
      width={meta?.w || undefined}
      height={meta?.h || undefined}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? "sync" : "async"}
      onLoad={() => setLoaded(true)}
      onError={(e) => {
        /* Вариант не отдался — возвращаемся к оригиналу */
        const el = e.currentTarget;
        if (el.src !== src) {
          el.srcset = "";
          el.src = src;
        }
      }}
      className={className}
      onClick={onClick}
      style={meta?.tone && !loaded ? { backgroundColor: meta.tone } : undefined}
    />
  );

  if (!optimized) return img;

  return (
    <picture>
      <source type="image/avif" srcSet={srcset(src, "avif", max)} sizes={sizes} />
      <source type="image/webp" srcSet={srcset(src, "webp", max)} sizes={sizes} />
      {img}
    </picture>
  );
}

/** Готовые значения sizes под места на витрине. */
export const SIZES = {
  /* Плитка каталога: колонки от 290 px, на телефоне — во всю ширину */
  tile: "(max-width: 560px) 92vw, (max-width: 980px) 46vw, 300px",
  /* Страница товара: колонка галереи */
  product: "(max-width: 760px) 100vw, (max-width: 1100px) 60vw, 620px",
  /* Лупа на весь экран */
  zoom: "100vw",
  /* Полоска миниатюр под галереей */
  thumb: "80px",
  /* Строки корзины и заказов */
  row: "72px",
};
