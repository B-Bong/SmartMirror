/**
 * useFallDetection — React hook for real-time fall detection via WebSocket.
 *
 * When isActive=true (camera on), opens a WebSocket to the Python backend,
 * captures frames from the <video> element at 15 fps via an off-screen canvas,
 * sends them as JPEG ArrayBuffers, and parses the JSON results.
 *
 * Uses a "one frame in-flight" strategy: the next frame is only captured
 * after the server responds to the previous one, preventing buffer buildup
 * when inference is slower than the capture interval.
 */

import { useRef, useState, useEffect, useCallback } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FallPerson {
  person_id: number
  activity: "Fall" | "Non-fall"
  angle: number
  vel_y: number
  vel_x: number
  ratio: number
  bbox: [number, number, number, number]
}

export interface FallDetectionResult {
  fall_detected: boolean
  global_fall_detected: boolean
  people_count: number
  people: FallPerson[]
  error?: string
}

export interface UseFallDetectionReturn {
  /** True when any person in frame is classified as falling */
  fallDetected: boolean
  /** True when someone exited the frame at high horizontal speed */
  globalFallDetected: boolean
  /** Number of people currently detected */
  peopleCount: number
  /** Whether the WebSocket connection to the backend is open */
  isConnected: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_URL = "ws://localhost:8000/ws/fall-detection"
/** Target frame rate for camera frame capture and backend inference */
const TARGET_FPS = 15
/** Frame capture interval in ms. 67ms is approximately 15 fps. */
const FRAME_INTERVAL_MS = Math.round(1000 / TARGET_FPS)
/** Downsampled resolution sent to backend. Smaller = faster inference */
const CAPTURE_WIDTH = 320
const CAPTURE_HEIGHT = 240

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFallDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isActive: boolean
): UseFallDetectionReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Prevents queuing multiple frames before the server responds */
  const processingRef = useRef(false)

  const [fallDetected, setFallDetected] = useState(false)
  const [globalFallDetected, setGlobalFallDetected] = useState(false)
  const [peopleCount, setPeopleCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  // ── Frame capture ──────────────────────────────────────────────────
  const captureAndSendFrame = useCallback(() => {
    // Skip if still waiting for the server's response to the previous frame
    if (processingRef.current) return

    const video = videoRef.current
    const ws = wsRef.current
    if (!video || !ws || ws.readyState !== WebSocket.OPEN) return
    // Wait until the video has enough data
    if (video.readyState < 2) return

    // Lazy-create a persistent off-screen canvas (avoids repeated allocation)
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas")
    }
    const canvas = canvasRef.current
    canvas.width = CAPTURE_WIDTH
    canvas.height = CAPTURE_HEIGHT

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Un-mirror the frame before sending (the CSS scaleX(-1) is visual only;
    // the backend needs spatially-correct coordinates for keypoint math)
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(video, -CAPTURE_WIDTH, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT)
    ctx.restore()

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        blob.arrayBuffer().then((buffer) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            processingRef.current = true
            wsRef.current.send(buffer)
          }
        })
      },
      "image/jpeg",
      0.7 // JPEG quality — good balance of size vs. detail for pose detection
    )
  }, [videoRef])

  // ── WebSocket lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      // Camera stopped → tear everything down
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      processingRef.current = false
      setIsConnected(false)
      setFallDetected(false)
      setGlobalFallDetected(false)
      setPeopleCount(0)
      return
    }

    // Camera active → open WebSocket
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[FallDetection] WebSocket connected")
      setIsConnected(true)
      // Start frame capture loop at target fps
      intervalRef.current = setInterval(captureAndSendFrame, FRAME_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      // Mark as ready for the next frame
      processingRef.current = false
      try {
        const data: FallDetectionResult = JSON.parse(event.data as string)
        if (data.error) {
          console.warn("[FallDetection] Server error:", data.error)
          return
        }
        setFallDetected(data.fall_detected)
        setGlobalFallDetected(data.global_fall_detected)
        setPeopleCount(data.people_count)
      } catch (e) {
        console.error("[FallDetection] Failed to parse message:", e)
      }
    }

    ws.onerror = () => {
      console.error("[FallDetection] WebSocket error")
      setIsConnected(false)
    }

    ws.onclose = () => {
      console.log("[FallDetection] WebSocket closed")
      setIsConnected(false)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      processingRef.current = false
    }

    // Cleanup when isActive flips to false or component unmounts
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      ws.close()
      processingRef.current = false
    }
  }, [isActive, captureAndSendFrame])

  return { fallDetected, globalFallDetected, peopleCount, isConnected }
}
