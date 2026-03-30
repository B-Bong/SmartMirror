"use client"

import { Activity, X, ShieldAlert, Clock } from "lucide-react"

interface FallAlertProps {
  /** Timestamp when the fall was first detected */
  detectedAt: Date
  /**
   * True when the alert was triggered by someone exiting the frame
   * at high lateral speed rather than an in-frame fall.
   */
  isGlobal?: boolean
  onDismiss: () => void
}

/**
 * FallAlert — full-screen emergency overlay shown when a fall is detected.
 *
 * Features:
 *  - Premium glassmorphic "FALL ALERT" UI
 *  - Sweeping background gradients
 *  - Animated warning icon
 *  - Detection timestamp
 *  - Manual-tap-only dismissal
 */
export function FallAlert({ detectedAt, isGlobal = false, onDismiss }: FallAlertProps) {
  const timeStr = detectedAt.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <>
      {/* ── Keyframes ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes fall-vignette-pulse {
          0%, 100% { box-shadow: inset 0 0 120px 30px rgba(220, 38, 38, 0.45); }
          50%       { box-shadow: inset 0 0 160px 50px rgba(220, 38, 38, 0.75); }
        }
        @keyframes fall-modal-shake {
          0%, 100%   { transform: translate(-50%, -50%) translateX(0); }
          15%  { transform: translate(-50%, -50%) translateX(-10px) rotate(-1deg); }
          30%  { transform: translate(-50%, -50%) translateX(10px) rotate(1deg); }
          45%  { transform: translate(-50%, -50%) translateX(-8px) rotate(-1deg); }
          60%  { transform: translate(-50%, -50%) translateX(8px) rotate(1deg); }
          75%  { transform: translate(-50%, -50%) translateX(-4px); }
        }
        @keyframes fall-icon-beat {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.8)); opacity: 1; }
          50%       { transform: scale(1.15); filter: drop-shadow(0 0 25px rgba(239, 68, 68, 1)); opacity: 0.9; }
        }
        @keyframes fall-badge-fade-in {
          0% { opacity: 0; transform: translateY(12px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes radar-scan {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* ── Pulsing vignette border (pointer-events:none so UI stays usable) ── */}
      <div
        className="absolute inset-0 z-50 pointer-events-none rounded-inherit mix-blend-screen"
        style={{ animation: "fall-vignette-pulse 1.3s ease-in-out infinite" }}
      />

      {/* ── Alert modal ───────────────────────────────────────────── */}
      <div
        className="absolute top-1/2 left-1/2 z-50 w-[85%]"
        style={{
          maxWidth: 360,
          animation: "fall-modal-shake 0.6s ease-out",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className="relative flex flex-col items-center overflow-hidden rounded-[28px] text-center"
          style={{
            background: "linear-gradient(180deg, rgba(30, 0, 0, 0.9) 0%, rgba(15, 0, 0, 0.95) 100%)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(239, 68, 68, 0.2) inset",
            animation: "fall-badge-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Animated Background Rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <div className="absolute w-32 h-32 rounded-full border border-red-500/30" style={{ animation: "radar-scan 2s infinite linear" }} />
            <div className="absolute w-32 h-32 rounded-full border border-red-500/30" style={{ animation: "radar-scan 2s infinite linear 1s" }} />
          </div>

          <div className="relative z-10 flex flex-col items-center w-full px-7 pt-10 pb-8 gap-5">
            {/* ── Corner dismiss (X) ────────────────────────────────── */}
            <button
              id="fall-alert-dismiss-corner"
              onClick={onDismiss}
              className="absolute top-4 right-4 flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110 active:scale-90 hover:bg-red-500/20"
              style={{
                width: 32,
                height: 32,
                background: "rgba(239, 68, 68, 0.1)",
                color: "rgba(252, 165, 165, 0.9)",
              }}
              aria-label="Dismiss fall alert"
            >
              <X size={16} />
            </button>

            {/* ── Animated warning icon ─────────────────────────────── */}
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{
                width: 84,
                height: 84,
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(153, 27, 27, 0.3) 100%)",
                border: "1px solid rgba(239, 68, 68, 0.6)",
                boxShadow: "0 0 30px rgba(239, 68, 68, 0.3)",
                animation: "fall-icon-beat 1s ease-in-out infinite",
              }}
            >
              <Activity size={44} strokeWidth={2.5} style={{ color: "#fca5a5" }} />
            </div>

            {/* ── Title ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5 mt-2">
              <h2
                className="text-[32px] font-black tracking-wider"
                style={{
                  color: "#fecaca",
                  textShadow: "0 2px 10px rgba(220, 38, 38, 0.8), 0 0 20px rgba(220, 38, 38, 0.4)"
                }}
              >
                FALL ALERT
              </h2>
              <div className="h-0.5 w-16 bg-red-500/50 mx-auto rounded-full mt-1 mb-1" />
            </div>

            {/* ── Description ───────────────────────────────────────── */}
            <p
              className="text-sm font-medium leading-relaxed px-2"
              style={{ color: "rgba(252, 165, 165, 0.85)" }}
            >
              {isGlobal
                ? "Potential Fall Detected!"
                : "A fall has been detected in the vicinity. Please check immediately."}
            </p>

            {/* ── Timestamp badge ───────────────────────────────────── */}
            <div
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl mt-1"
              style={{
                background: "rgba(0, 0, 0, 0.5)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)"
              }}
            >
              <Clock size={14} style={{ color: "#f87171" }} />
              <span
                className="text-[13px] font-semibold tracking-wide"
                style={{ color: "rgba(252, 165, 165, 0.9)" }}
              >
                Detected at {timeStr}
              </span>
            </div>

            {/* ── Primary dismiss button ────────────────────────────── */}
            <button
              id="fall-alert-dismiss-primary"
              onClick={onDismiss}
              className="w-full py-4 px-6 rounded-2xl font-bold text-[15px] transition-all duration-300 hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-2 mt-2"
              style={{
                background: "linear-gradient(to bottom, rgba(220, 38, 38, 0.25), rgba(153, 27, 27, 0.4))",
                border: "1px solid rgba(239, 68, 68, 0.6)",
                color: "#fecaca",
                boxShadow: "0 8px 25px rgba(220, 38, 38, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <ShieldAlert size={18} />
              Acknowledge Alert
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
