/* Логотип «ЭПОХА»: сериф-вензель, в котором буква «О» — золочёное
   овальное зеркало с бликом. Чистый SVG, масштабируется без потерь. */

export function Logo({ h = 34 }: { h?: number }) {
  return (
    <svg
      height={h}
      viewBox="0 0 212 56"
      fill="none"
      role="img"
      aria-label="ЭПОХА"
    >
      <defs>
        <linearGradient id="lg-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d097" />
          <stop offset="0.55" stopColor="#b9985e" />
          <stop offset="1" stopColor="#8a6f3e" />
        </linearGradient>
        <linearGradient id="lg-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c3a2e" />
          <stop offset="0.5" stopColor="#16211a" />
          <stop offset="1" stopColor="#0c130e" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="43"
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontWeight="700"
        fontSize="46"
        letterSpacing="4"
        fill="currentColor"
      >
        ЭП
      </text>
      {/* О — овальное зеркало в латунной раме */}
      <g transform="translate(66 4)">
        <ellipse cx="24" cy="24" rx="21" ry="24" fill="url(#lg-brass)" />
        <ellipse cx="24" cy="24" rx="16.5" ry="19.5" fill="url(#lg-glass)" />
        {/* блик амальгамы */}
        <path
          d="M14 12 C19 6.5, 28 6, 31 9 C26 9.5, 18 14, 15.5 19 C13.5 17, 13 14, 14 12 Z"
          fill="rgba(233, 224, 200, 0.35)"
        />
        <circle cx="24" cy="1.5" r="2.6" fill="url(#lg-brass)" />
      </g>
      <text
        x="118"
        y="43"
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontWeight="700"
        fontSize="46"
        letterSpacing="4"
        fill="currentColor"
      >
        ХА
      </text>
    </svg>
  );
}
