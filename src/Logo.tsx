/* Логотип VINTAGE MĒBELES — двухъярусный вензель: серифное слово,
   латунная линейка с ромбом и разрядка второй строки.
   Заменяется на фирменный, когда будет готов файл. */

export function Logo({ h = 34 }: { h?: number }) {
  return (
    <svg
      height={h}
      viewBox="0 0 260 58"
      fill="none"
      role="img"
      aria-label="VINTAGE MĒBELES"
    >
      <defs>
        <linearGradient id="lg-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d097" />
          <stop offset="0.55" stopColor="#b9985e" />
          <stop offset="1" stopColor="#8a6f3e" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="27"
        fontFamily="'Prata', 'Cormorant Garamond', Georgia, serif"
        fontSize="27"
        letterSpacing="1.5"
        fill="currentColor"
      >
        VINTAGE
      </text>

      {/* латунная линейка с ромбом-разделителем */}
      <rect x="1" y="34" width="86" height="1.2" fill="url(#lg-brass)" opacity="0.85" />
      <rect
        x="94"
        y="30.4"
        width="8"
        height="8"
        rx="1"
        fill="url(#lg-brass)"
        transform="rotate(45 98 34.4)"
      />
      <rect x="110" y="34" width="86" height="1.2" fill="url(#lg-brass)" opacity="0.85" />

      <text
        x="1"
        y="52"
        fontFamily="'Onest', system-ui, sans-serif"
        fontSize="13.5"
        fontWeight="600"
        letterSpacing="6.4"
        fill="url(#lg-brass)"
      >
        MĒBELES
      </text>
    </svg>
  );
}
