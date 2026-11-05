// Original seekpi-2 wordmark (does not reuse the SEE KPI vendor logo artwork).
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 260 56" role="img" aria-label="SEEKPI-2">
      <g transform="translate(28 28)">
        <circle r="24" fill="#1A90DC" />
        <circle r="16" fill="#fff" />
        <circle r="8" fill="#d4a017" />
        <path d="M0 0 L20 -20" stroke="#5a2d0c" strokeWidth="4" strokeLinecap="round" />
        <path d="M16 -24 L24 -24 L24 -16" fill="none" stroke="#5a2d0c" strokeWidth="3" strokeLinecap="round" />
      </g>
      <text x="62" y="36" fontFamily="Sarabun, Segoe UI, sans-serif" fontWeight="700" fontSize="30" fill="#17324d">SEEKPI</text>
      <text x="172" y="36" fontFamily="Sarabun, Segoe UI, sans-serif" fontWeight="700" fontSize="30" fill="#1A90DC">-2</text>
      <text x="63" y="51" fontFamily="Sarabun, Segoe UI, sans-serif" fontSize="10.5" fill="#6b7785" letterSpacing=".6">SYNTEC PERFORMANCE MANAGEMENT</text>
    </svg>
  )
}
