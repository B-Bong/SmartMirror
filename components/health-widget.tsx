"use client"

import type { ReactNode } from "react"

interface HealthWidgetProps {
  icon: ReactNode
  value: string
  unit?: string
  label: string
  accentColor: string
}

export function HealthWidget({ icon, value, unit, label, accentColor }: HealthWidgetProps) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2.5" style={{ minWidth: "68px" }}>
      {/* Icon + label */}
      <div className="flex items-center gap-1">
        <span style={{ color: accentColor, opacity: 0.7, display: "flex" }}>{icon}</span>
        <span
          style={{
            fontSize: "9.5px",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>

      {/* Value + unit */}
      <div className="flex items-baseline gap-0.5">
        <span
          className="font-semibold leading-none"
          style={{
            fontSize: "17px",
            color: accentColor,
            textShadow: `0 0 12px ${accentColor}66`,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}
