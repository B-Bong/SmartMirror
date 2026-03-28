"use client"

interface LedStripProps {
  side: "left" | "right"
  scanning?: boolean
}

/** Renders one vertical LED bar — a solid rectangular warm-white light bar
 *  with rounded corners, an inner glow and scanning pulse when active. */
export function LedStrip({ side, scanning }: LedStripProps) {
  return (
    <div
      aria-hidden="true"
      className={`absolute top-0 bottom-0 z-20 flex items-center ${side === "left" ? "left-0 pl-2" : "right-0 pr-2"}`}
    >
      {/* Rounded rectangular bar */}
      <div
        style={{
          width: "clamp(8px, 1.2vw, 14px)",
          height: "72%",
          borderRadius: "999px",
          overflow: "hidden",
          position: "relative",
          // Outer glow cast toward the mirror
          boxShadow:
            side === "left"
              ? "0 0 18px 6px rgba(255,240,180,0.30), 0 0 50px 16px rgba(255,235,160,0.12)"
              : "0 0 18px 6px rgba(255,240,180,0.30), 0 0 50px 16px rgba(255,235,160,0.12)",
        }}
      >
        {/* Main warm-white fill */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(255,252,235,0.92) 0%, rgba(255,245,200,0.98) 50%, rgba(255,252,235,0.92) 100%)",
          }}
        />

        {/* Specular edge highlight facing the mirror */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "30%",
            [side === "left" ? "right" : "left"]: 0,
            background:
              side === "left"
                ? "linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 100%)"
                : "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 100%)",
          }}
        />

        {/* Scanning pulse overlay — only when active */}
        {scanning && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(148,210,230,0.5) 50%, transparent 100%)",
              animation: "led-scan 2.4s ease-in-out infinite",
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes led-scan {
          0%   { opacity: 0.3; transform: translateY(-30%); }
          50%  { opacity: 1;   transform: translateY(0%); }
          100% { opacity: 0.3; transform: translateY(30%); }
        }
      `}</style>
    </div>
  )
}
