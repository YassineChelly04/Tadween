// Yassine Chelly's personal mark (brand book: 02_Logo/svg/yc-mark-ink.svg),
// used only as the developer's credit, as the brand's "Startup Horizon" allows:
// the person endorses the product, the product keeps its own mark.
// Colours follow the theme: ink mark with the ember dot, paper on dark grounds.

export function YcMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Yassine Chelly">
      <g fill="none" stroke="var(--ink)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M53.67 28.18 A22 22 0 1 1 35.82 10.33" />
        <path d="M55 10 C46 13 37 17 34 21 C31 25 38 26.5 41 29 C45 33 41 38 33 38 C27 38 23 36 22 32" />
      </g>
      <circle cx="27.5" cy="45.5" r="3.2" fill="var(--ink)" />
      <circle cx="36.5" cy="45.5" r="3.6" fill="var(--ember)" />
    </svg>
  );
}
