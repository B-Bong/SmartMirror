"use client"

interface WellnessWidgetProps {
  score: number
}

export function WellnessWidget({ score }: WellnessWidgetProps) {
  const green = "#6ee7b7"
  const size = 34
  const strokeW = 3
  const r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2.5" style={{ minWidth: "68px" }}>
      {/* Label */}
      <div className="flex items-center gap-1">
        <span style={{ color: green, opacity: 0.7, fontSize: "12px", display: "flex" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <span
          style={{
            fontSize: "9.5px",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Wellness
        </span>
      </div>

      {/* Mini ring + score */}
      <div className="flex items-center gap-1">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-label={`Wellness ${score}/100`}
          role="img"
        >
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={green} strokeWidth={strokeW} fill="none"
            strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 3px ${green}99)` }}
          />
          <text
            x={size / 2} y={size / 2}
            textAnchor="middle" dominantBaseline="middle"
            fill={green} fontSize="8.5" fontWeight="700" fontFamily="Geist, sans-serif"
          >
            {score}
          </text>
        </svg>
        <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.3)" }}>/100</span>
      </div>
    </div>
  )
}
