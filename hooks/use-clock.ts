"use client"

import { useState, useEffect } from "react"

/** Returns a live Date object, updated every second. */
export function useClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return now
}
