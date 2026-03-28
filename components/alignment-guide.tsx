"use client"

interface AlignmentGuideProps {
  scanning?: boolean
}

export function AlignmentGuide({ scanning }: AlignmentGuideProps) {
  // Oval dimensions (in SVG units, viewBox 280x340)
  const cx = 140
  const cy = 155
  const rx = 82   // horizontal radius
  const ry = 108  // vertical radius
  const accentColor = "rgba(148,210,230,"

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
      <div className="relative flex flex-col items-center gap-4">
        <svg
          viewBox="0 0 280 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{
            width: "clamp(260px, 54vw, 430px)",
            overflow: "visible",
          }}
        >
          <defs>
            {/* Clipping mask for the scan line — clip to the oval */}
            <clipPath id="face-oval-clip">
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
            </clipPath>

            {/* Scan sweep gradient */}
            <linearGradient id="scan-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(148,230,210,0)" />
              <stop offset="40%" stopColor="rgba(148,230,210,0.10)" />
              <stop offset="100%" stopColor="rgba(148,230,210,0.22)" />
            </linearGradient>

            {/* Oval stroke gradient — brighter at top */}
            <linearGradient id="oval-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`${accentColor}0.9)`} />
              <stop offset="50%" stopColor={`${accentColor}0.55)`} />
              <stop offset="100%" stopColor={`${accentColor}0.3)`} />
            </linearGradient>

            {/* Subtle glow filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Stronger glow for corner brackets */}
            <filter id="glow-strong" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Main face oval ── */}
          <ellipse
            cx={cx} cy={cy} rx={rx} ry={ry}
            stroke="url(#oval-grad)"
            strokeWidth="1.5"
            filter="url(#glow)"
          />

          {/* ── Scan sweep (clipped to oval, only when scanning) ── */}
          {scanning && (
            <g clipPath="url(#face-oval-clip)">
              <rect
                x={cx - rx} y={cy - ry}
                width={rx * 2}
                height={ry * 2}
                fill="url(#scan-grad)"
                style={{ animation: "scan-fill 2.4s linear infinite" }}
              />
              <line
                x1={cx - rx} y1={cy - ry}
                x2={cx + rx} y2={cy - ry}
                stroke={`${accentColor}0.55)`}
                strokeWidth="1"
                filter="url(#glow)"
                style={{ animation: "scan-line 2.4s linear infinite" }}
              />
            </g>
          )}

          {/* ── Corner brackets ── */}
          {/* Top-left */}
          <path
            d={`M ${cx - rx + 20} ${cy - ry} L ${cx - rx} ${cy - ry} L ${cx - rx} ${cy - ry + 22}`}
            stroke={`${accentColor}0.9)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            filter="url(#glow-strong)"
          />
          {/* Top-right */}
          <path
            d={`M ${cx + rx - 20} ${cy - ry} L ${cx + rx} ${cy - ry} L ${cx + rx} ${cy - ry + 22}`}
            stroke={`${accentColor}0.9)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            filter="url(#glow-strong)"
          />
          {/* Bottom-left */}
          <path
            d={`M ${cx - rx} ${cy + ry - 22} L ${cx - rx} ${cy + ry} L ${cx - rx + 20} ${cy + ry}`}
            stroke={`${accentColor}0.9)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            filter="url(#glow-strong)"
          />
          {/* Bottom-right */}
          <path
            d={`M ${cx + rx} ${cy + ry - 22} L ${cx + rx} ${cy + ry} L ${cx + rx - 20} ${cy + ry}`}
            stroke={`${accentColor}0.9)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            filter="url(#glow-strong)"
          />
        </svg>

        {/* ── Status pill ── */}
        <div
          className="flex items-center gap-2.5 px-4 py-2 rounded-full"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(148,210,230,0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 0 18px rgba(148,210,230,0.08)",
          }}
          aria-live="polite"
        >
          {/* Dot — only animates while scanning */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "#94d2e6",
              boxShadow: "0 0 8px 2px #94d2e6",
              animation: scanning ? "mirror-pulse 1.4s ease-in-out infinite" : "none",
              opacity: scanning ? 1 : 0.4,
            }}
            aria-hidden="true"
          />
          <p
            style={{
              fontSize: "clamp(10px, 1.3vw, 12px)",
              color: "rgba(148,210,230,0.75)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {scanning ? "Scanning…" : "Align face & shoulders"}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0%   { transform: translateY(0); }
          100% { transform: translateY(${ry * 2}px); }
        }
        @keyframes scan-fill {
          0%   { clip-path: inset(0 0 100% 0); }
          100% { clip-path: inset(0 0 0% 0); }
        }
      `}</style>
    </div>
  )
}
