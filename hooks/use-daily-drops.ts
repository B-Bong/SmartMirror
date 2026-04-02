import { useState, useEffect } from "react"

export interface DailyDrop {
  id: string
  caregiver_id: string
  elderly_id: string
  message_text: string | null
  image_url: string | null
  media_type: "image" | "video" | "text"
  is_viewed: boolean
  created_at: string
}

export function useDailyDrops(pollIntervalMs = 15000) {
  const [currentDrop, setCurrentDrop] = useState<DailyDrop | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const checkUnreadDrops = async () => {
    if (isChecking) return

    try {
      setIsChecking(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/api/drops/unread`)
      
      if (!res.ok) {
        throw new Error("Failed to fetch drops")
      }
      
      const data = await res.json()
      if (data.has_drop && data.drop) {
        // Prevent re-triggering for the same drop ID if we haven't dismissed it
        setCurrentDrop((prev) => {
          if (prev?.id === data.drop.id) return prev
          return data.drop
        })
      }
    } catch (err) {
      console.error("[useDailyDrops] Error checking for drops:", err)
    } finally {
      setIsChecking(false)
    }
  }

  const markAsViewed = async (dropId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      await fetch(`${apiUrl}/api/drops/${dropId}/mark-viewed`, {
        method: "POST"
      })
      setCurrentDrop(null) // Clear from local state
    } catch (err) {
      console.error("[useDailyDrops] Error marking drop as viewed:", err)
    }
  }

  useEffect(() => {
    // Initial check
    checkUnreadDrops()
    
    // Poll on interval
    const interval = setInterval(() => {
      // Only check if we are not currently displaying a drop
      setCurrentDrop((current) => {
        if (!current) {
          checkUnreadDrops()
        }
        return current
      })
    }, pollIntervalMs)
    
    return () => clearInterval(interval)
  }, [pollIntervalMs])

  return {
    currentDrop,
    markAsViewed
  }
}
