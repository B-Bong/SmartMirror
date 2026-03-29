"use client"

import { useState, useEffect } from "react"

export interface KLWeather {
  date: string
  morning_forecast: string
  afternoon_forecast: string
  night_forecast: string
  summary_forecast: string
  summary_when: string
  min_temp: number
  max_temp: number
  current_period: "morning" | "afternoon" | "night"
  current_forecast: string
}

const API_URL =
  "https://api.data.gov.my/weather/forecast?contains=Kuala+Lumpur@location__location_name&limit=7"

// Returns today's date as YYYY-MM-DD in Malaysia local time (UTC+8)
function getMalaysiaDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" })
}

function getCurrentPeriod(): "morning" | "afternoon" | "night" {
  const hour = parseInt(
    new Date().toLocaleTimeString("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      hour: "numeric",
      hour12: false,
    })
  )
  if (hour >= 6 && hour < 12) return "morning"
  if (hour >= 12 && hour < 18) return "afternoon"
  return "night"
}

export function useWeather() {
  const [weather, setWeather] = useState<KLWeather | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        setError(null)
        const res = await window.fetch(API_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data: Array<{
          location: { location_id: string; location_name: string }
          date: string
          morning_forecast: string
          afternoon_forecast: string
          night_forecast: string
          summary_forecast: string
          summary_when: string
          min_temp: number
          max_temp: number
        }> = await res.json()

        const today = getMalaysiaDateString()
        const entry = data.find(
          (d) =>
            d.date === today &&
            d.location.location_name === "Kuala Lumpur"
        )

        if (!entry) {
          // Fallback: just take the most recent KL entry
          const klEntry = data.find((d) => d.location.location_name === "Kuala Lumpur")
          if (!klEntry) throw new Error("No KL forecast data")

          const period = getCurrentPeriod()
          setWeather({
            ...klEntry,
            current_period: period,
            current_forecast:
              period === "morning"
                ? klEntry.morning_forecast
                : period === "afternoon"
                ? klEntry.afternoon_forecast
                : klEntry.night_forecast,
          })
          return
        }

        const period = getCurrentPeriod()
        setWeather({
          ...entry,
          current_period: period,
          current_forecast:
            period === "morning"
              ? entry.morning_forecast
              : period === "afternoon"
              ? entry.afternoon_forecast
              : entry.night_forecast,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load weather")
      } finally {
        setLoading(false)
      }
    }

    fetch()
    const interval = setInterval(fetch, 30 * 60 * 1000) // refresh every 30 min
    return () => clearInterval(interval)
  }, [])

  return { weather, loading, error }
}
