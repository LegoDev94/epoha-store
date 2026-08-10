import SEED from "../../data/products.json";

/* Категории заводит владелец в панели, поэтому ключ — просто строка.
   Список приходит с сервера вместе с подписями на языках витрины. */
export type Category = string;

export interface Cat {
  key: string;
  icon: string;
  order?: number;
  hidden?: boolean;
  tr: Partial<Record<Lang, string>>;
}
/* Витрина говорит на пяти языках соседних рынков. */
export type Lang = "lv" | "en" | "ru" | "lt" | "et";

export interface Tr {
  title: string;
  era: string;
  desc: string;
}

export interface Lot {
  id: number;
  n: string;
  cat: Category;
  price: number;
  sold?: boolean;
  images: string[];
  source?: string;
  createdAt?: string;
  /** null / отсутствует — товар самой площадки, иначе продавец-партнёр */
  sellerId?: string | null;
  /** размеры и основной цвет каждой фотографии — приходят с сервера */
  img?: { w: number; h: number; tone: string }[];
  tr: Record<Lang, Tr>;
}

/** Юридические данные продавца: показываются покупателю до заказа. */
export interface SellerInfo {
  id: string;
  name: string;
  regNr: string;
  vatNr: string;
  address: string;
  country: string;
}

/** Локальный сид — фолбэк, когда API недоступен (напр. GitHub Pages). */
export const SEED_LOTS = SEED as unknown as Lot[];

/* Запасной список: он же исходный набор категорий. Нужен, когда сайт
   открыт без сервера — на статике или пока сервер отвечает. */
export const SEED_CATS: Cat[] = [
  { key: "seating", icon: "seating", tr: { lv: "Mīkstās mēbeles", en: "Seating", ru: "Мягкая мебель", lt: "Minkšti baldai", et: "Pehme mööbel" } },
  { key: "mirror", icon: "mirror", tr: { lv: "Spoguļi", en: "Mirrors", ru: "Зеркала", lt: "Veidrodžiai", et: "Peeglid" } },
  { key: "light", icon: "light", tr: { lv: "Apgaismojums", en: "Lighting", ru: "Свет", lt: "Apšvietimas", et: "Valgustid" } },
  { key: "storage", icon: "storage", tr: { lv: "Kumodes un glabāšana", en: "Chests & storage", ru: "Комоды и хранение", lt: "Komodos ir spintos", et: "Kummutid ja hoiustamine" } },
  { key: "table", icon: "table", tr: { lv: "Galdi", en: "Tables", ru: "Столы", lt: "Stalai", et: "Lauad" } },
  { key: "decor", icon: "decor", tr: { lv: "Dekors un keramika", en: "Decor & ceramics", ru: "Декор и керамика", lt: "Dekoras ir keramika", et: "Dekoor ja keraamika" } },
];

/** Подпись категории на языке покупателя. */
export const catLabel = (c: Cat | undefined, lang: Lang) =>
  c ? c.tr[lang] || c.tr.lv || c.key : "";

/** Путь к изображению: абсолютные и серверные — как есть. */
export const src = (u: string) => u;

export interface Collection {
  key: string;
  cover: number;
  ids: number[];
}

export const COLLECTIONS: Collection[] = [
  { key: "salon", cover: 5227354, ids: [5212622, 5245111, 5254437, 5247040, 5227354] },
  { key: "cabinet", cover: 5250025, ids: [5250025, 5215248, 5265275, 5250479, 5270547] },
  { key: "light", cover: 5243214, ids: [5243214, 5228214, 5269207, 5272818, 5266899] },
];
