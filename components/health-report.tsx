"use client"

import { Heart, Wind, Brain, Activity, X, CheckCircle } from "lucide-react"
import { HealthMetrics } from "@/lib/types"

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  accentColor: string
  confidence?: number | null
}

function MetricCard({ icon, label, value, unit, accentColor, confidence }: MetricCardProps) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "12px",
        padding: "12px 14px",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: accentColor }}>{icon}</span>
        <span
          style={{
            fontSize: "9px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={{
            fontSize: "26px",
            fontWeight: 700,
            color: accentColor,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{unit}</span>
        )}
      </div>
      {confidence != null && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div
            style={{
              height: "3px",
              width: "100%",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "99px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(confidence * 100)}%`,
                background: accentColor,
                borderRadius: "99px",
                transition: "width 0.8s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            {Math.round(confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}

interface HealthReportProps {
  metrics: HealthMetrics
  wellnessScore: number
  stressLevel: "Low" | "Moderate" | "High"
  onDismiss: () => void
}

const stressColors: Record<string, string> = {
  Low: "#86efac",
  Moderate: "#fde68a",
  High: "#fca5a5",
}

export function HealthReport({ metrics, wellnessScore, stressLevel, onDismiss }: HealthReportProps) {
  const timestamp = metrics.timestamp
    ? new Date(metrics.timestamp).toLocaleTimeString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null

  return (
    <>
      {/* Keyframe for slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Backdrop tap-to-dismiss */}
      <div
        className="absolute inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.3)" }}
        onClick={onDismiss}
      />

      {/* Report panel */}
      <div
        className="absolute bottom-0 left-0 right-0 z-50"
        style={{
          animation: "slideUp 0.45s cubic-bezier(0.34,1.22,0.64,1) forwards",
        }}
      >
        <div
          style={{
            background: "rgba(8,10,14,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderBottom: "none",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            borderRadius: "20px 20px 0 0",
            padding: "20px 16px 24px",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} style={{ color: "#86efac" }} />
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: "rgba(255,255,255,0.9)",
                    textTransform: "uppercase",
                  }}
                >
                  Health Report
                </p>
                {timestamp && (
                  <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                    Scanned at {timestamp}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onDismiss}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                padding: "6px",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Metrics grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <MetricCard
              icon={<Heart size={13} strokeWidth={2} className="animate-pulse" />}
              label="Heart Rate"
              value={metrics.heartRate ? Math.round(metrics.heartRate).toString() : "--"}
              unit="BPM"
              accentColor="#f9a8b8"
              confidence={metrics.heartRateConfidence}
            />
            <MetricCard
              icon={<Wind size={13} strokeWidth={2} />}
              label="Respiration"
              value={metrics.respiratoryRate ? Math.round(metrics.respiratoryRate).toString() : "--"}
              unit="br/min"
              accentColor="#7dd3e8"
              confidence={metrics.respiratoryRateConfidence}
            />
            <MetricCard
              icon={<Brain size={13} strokeWidth={2} />}
              label="Stress Level"
              value={stressLevel}
              accentColor={stressColors[stressLevel]}
            />
            <MetricCard
              icon={<Activity size={13} strokeWidth={2} />}
              label="Wellness Score"
              value={wellnessScore.toString()}
              unit="/ 100"
              accentColor="#c4b5fd"
            />
          </div>

          {/* HRV row if available */}
          {(metrics.hrvSdnn !== null || metrics.hrvRmssd !== null) && (
            <div
              className="flex items-center gap-3 mt-3"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px",
                padding: "10px 12px",
              }}
            >
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                HRV
              </span>
              {metrics.hrvSdnn !== null && (
                <div className="flex items-baseline gap-1">
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#a5f3fc" }}>
                    {Math.round(metrics.hrvSdnn)}
                  </span>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>SDNN ms</span>
                </div>
              )}
              {metrics.hrvRmssd !== null && (
                <div className="flex items-baseline gap-1 ml-2">
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#a5f3fc" }}>
                    {Math.round(metrics.hrvRmssd)}
                  </span>
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>RMSSD ms</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
