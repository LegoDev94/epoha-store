/**
 * Логотип SOFA.LV: латунный диван и надпись.
 *
 * Файл один, но фонов два. На бумажной витрине слово тёмно-коричневое
 * и читается хорошо, а в тёмном подвале пропадает — поэтому там стоит
 * светлый вариант, где слово перекрашено в сливочный тон, а латунь
 * оставлена золотой.
 *
 * Размер задаётся высотой: ширина считается по пропорции исходника,
 * чтобы место под логотип занималось сразу и шапка не дёргалась при
 * загрузке.
 */

/** Пропорции обрезанного исходника: 1446 × 374. */
const RATIO = 1446 / 374;
const WIDTHS = [240, 360, 480, 720];

export function Logo({ h = 34, tone = "dark" }: { h?: number; tone?: "dark" | "light" }) {
  const w = Math.round(h * RATIO);
  const name = (px: number) => `/logo/sofa${tone === "light" ? "-light" : ""}-${px}.png`;

  return (
    <img
      src={name(360)}
      srcSet={WIDTHS.map((px) => `${name(px)} ${px}w`).join(", ")}
      sizes={`${w}px`}
      width={w}
      height={h}
      alt="SOFA.LV"
      decoding="async"
      style={{ height: h, width: "auto", display: "block" }}
    />
  );
}
