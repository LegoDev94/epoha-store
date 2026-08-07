import SEED from "../../data/products.json";

export type Category = "seating" | "mirror" | "light" | "storage" | "table" | "decor";
export type Lang = "lv" | "en" | "ru";

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

export const CATEGORY_KEYS: (Category | "all")[] = [
  "all",
  "seating",
  "mirror",
  "light",
  "storage",
  "table",
  "decor",
];

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
