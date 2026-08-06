/* Логотип EPOHA: сериф-вензель, где «O» — золочёное овальное зеркало
   с бликом амальгамы. Латиница читается во всех трёх языках. */

export function Logo({ h = 34 }: { h?: number }) {
  return (
    <svg height={h} viewBox="0 0 196 56" fill="none" role="img" aria-label="EPOHA">
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
        fontFamily="'Prata', 'Cormorant Garamond', Georgia, serif"
        fontSize="44"
        letterSpacing="3"
        fill="currentColor"
      >
        EP
      </text>
      {/* O — овальное зеркало в латунной раме */}
      <g transform="translate(62 5)">
        <ellipse cx="23" cy="23" rx="20" ry="23" fill="url(#lg-brass)" />
        <ellipse cx="23" cy="23" rx="15.5" ry="18.5" fill="url(#lg-glass)" />
        <path
          d="M13 11 C18 6, 27 5.6, 30 8.4 C25 9, 17.5 13.4, 15 18.2 C13 16.2, 12.3 13.2, 13 11 Z"
          fill="rgba(233, 224, 200, 0.35)"
        />
        <circle cx="23" cy="1" r="2.5" fill="url(#lg-brass)" />
      </g>
      <text
        x="110"
        y="43"
        fontFamily="'Prata', 'Cormorant Garamond', Georgia, serif"
        fontSize="44"
        letterSpacing="3"
        fill="currentColor"
      >
        HA
      </text>
    </svg>
  );
}
