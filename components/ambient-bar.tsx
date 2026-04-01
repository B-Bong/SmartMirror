"use client"

import { Sun, Cloud, CloudRain, CloudLightning, CloudDrizzle, Wind, MapPin } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"
import { useClock } from "@/hooks/use-clock"

function getForecastDisplay(forecast: string): { icon: React.ReactNode; label: string; color: string } {
  const f = forecast.toLowerCase()
  if (f.includes("ribut petir")) {
    const severity = f.includes("menyeluruh")
      ? "Severe Storm"
      : f.includes("kebanyakan")
      ? "Heavy Thunder"
      : "Thunderstorm"
    return { icon: <CloudLightning size={20} />, label: severity, color: "#fbbf24" }
  }
  if (f.includes("hujan menyeluruh") || f.includes("kebanyakan")) {
    return { icon: <CloudRain size={20} />, label: "Heavy Rain", color: "#60a5fa" }
  }
  if (f.includes("hujan di beberapa")) {
    return { icon: <CloudDrizzle size={20} />, label: "Showers", color: "#7dd3e8" }
  }
  if (f.includes("hujan")) {
    return { icon: <CloudRain size={20} />, label: "Rain", color: "#60a5fa" }
  }
  if (f.includes("berjerebu")) {
    return { icon: <Wind size={20} />, label: "Hazy", color: "#d1d5db" }
  }
  if (f.includes("berawan")) {
    return { icon: <Cloud size={20} />, label: "Cloudy", color: "#9ca3af" }
  }
  return { icon: <Sun size={20} />, label: "Clear", color: "#fbbf24" }
}

export function AmbientBar() {
  const { weather } = useWeather()
  const now = useClock()

  const timeStr = now.toLocaleTimeString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  const dateStr = now.toLocaleDateString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const pillStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "16px",
  }

  const forecast = weather?.summary_forecast ?? ""
  const { icon: weatherIcon, label: weatherLabel, color: weatherColor } =
    getForecastDisplay(forecast)

  return (
    <div
      className="absolute top-4 left-0 right-0 z-20 flex items-start justify-between"
      style={{ padding: "0 16px" }}
    >
      {/* ── Weather pill (left) ── */}
      <div style={{ ...pillStyle, padding: "10px 14px", minWidth: "90px" }}>
        <div className="flex items-center gap-2">
          <span style={{ color: weatherColor }}>{weatherIcon}</span>
          <div>
            <div className="flex items-baseline gap-1">
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.95)",
                  lineHeight: 1,
                }}
              >
                {weather ? `${weather.max_temp}°` : "—"}
              </span>
              {weather && (
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                  / {weather.min_temp}°C
                </span>
              )}
            </div>
            <div
              style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}
            >
              {weather ? weatherLabel : "Loading..."}
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-1"
          style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", marginTop: "6px" }}
        >
          <MapPin size={9} />
          <span>Kuala Lumpur</span>
        </div>
      </div>

      {/* ── Clock pill (right) ── */}
      <div style={{ ...pillStyle, padding: "10px 14px", textAlign: "right" }}>
        <div
          suppressHydrationWarning
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.95)",
            lineHeight: 1,
            letterSpacing: "-0.5px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeStr}
        </div>
        <div
          suppressHydrationWarning
          style={{
            fontSize: "9px",
            color: "rgba(255,255,255,0.38)",
            marginTop: "5px",
            letterSpacing: "0.04em",
          }}
        >
          {dateStr}
        </div>
      </div>
    </div>
  )
}
