/**
 * Флаги языков — рисованные, а не значки-эмодзи.
 *
 * Эмодзи-флаги на Windows не рисуются вовсе: система показывает пару
 * букв вместо полотнища, и переключатель выглядит поломанным. Здесь
 * простые фигуры, одинаковые в любом браузере и на любой системе.
 *
 * Английскому соответствует британский флаг: языку страны нет, а
 * покупатель ищет глазами именно его.
 */
const W = 21;
const H = 15;

export function Flag({ code, className = "" }: { code: string; className?: string }) {
  const common = {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    className: `flag ${className}`.trim(),
    role: "presentation" as const,
    "aria-hidden": true,
  };

  switch (code) {
    /* Латвия: карминовый с белой полосой посередине */
    case "lv":
      return (
        <svg {...common}>
          <rect width={W} height={H} fill="#9d2235" />
          <rect y="6" width={W} height="3" fill="#fff" />
        </svg>
      );

    /* Литва: жёлтый, зелёный, красный */
    case "lt":
      return (
        <svg {...common}>
          <rect width={W} height="5" fill="#fdb913" />
          <rect y="5" width={W} height="5" fill="#006a44" />
          <rect y="10" width={W} height="5" fill="#c1272d" />
        </svg>
      );

    /* Эстония: синий, чёрный, белый */
    case "et":
      return (
        <svg {...common}>
          <rect width={W} height="5" fill="#0072ce" />
          <rect y="5" width={W} height="5" fill="#101010" />
          <rect y="10" width={W} height="5" fill="#fff" />
        </svg>
      );

    /* Россия: белый, синий, красный */
    case "ru":
      return (
        <svg {...common}>
          <rect width={W} height="5" fill="#fff" />
          <rect y="5" width={W} height="5" fill="#0039a6" />
          <rect y="10" width={W} height="5" fill="#d52b1e" />
        </svg>
      );

    /* Великобритания: диагонали, крест, белая обводка */
    case "en":
      return (
        <svg {...common}>
          <rect width={W} height={H} fill="#012169" />
          <path d={`M0 0 L${W} ${H} M${W} 0 L0 ${H}`} stroke="#fff" strokeWidth="3" />
          <path d={`M0 0 L${W} ${H} M${W} 0 L0 ${H}`} stroke="#c8102e" strokeWidth="1.6" />
          <path d={`M${W / 2} 0 V${H} M0 ${H / 2} H${W}`} stroke="#fff" strokeWidth="5" />
          <path d={`M${W / 2} 0 V${H} M0 ${H / 2} H${W}`} stroke="#c8102e" strokeWidth="3" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <rect width={W} height={H} fill="#e6ddcc" />
        </svg>
      );
  }
}
