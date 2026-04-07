import { useState, useEffect, useRef, useCallback, RefObject } from "react"
import { DailyDrop } from "@/hooks/use-daily-drops"
import { Heart, MessageSquare, X } from "lucide-react"

// ── Emotion config ────────────────────────────────────────────────────────────
const EMOTION_CONFIG: Record<string, { emoji: string; label: string; color: string; glow: string }> = {
  happy:    { emoji: "😊", label: "Happy",     color: "#fde68a", glow: "rgba(253,230,138,0.55)" },
  sad:      { emoji: "😢", label: "Sad",       color: "#93c5fd", glow: "rgba(147,197,253,0.55)" },
  angry:    { emoji: "😠", label: "Angry",     color: "#fca5a5", glow: "rgba(252,165,165,0.55)" },
  surprise: { emoji: "😮", label: "Surprised", color: "#c4b5fd", glow: "rgba(196,181,253,0.55)" },
  fear:     { emoji: "😨", label: "Fearful",   color: "#6ee7b7", glow: "rgba(110,231,183,0.45)" },
  disgust:  { emoji: "🤢", label: "Disgusted", color: "#86efac", glow: "rgba(134,239,172,0.45)" },
  neutral:  { emoji: "😐", label: "Neutral",   color: "#d1d5db", glow: "rgba(209,213,219,0.35)" },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const DETECT_INTERVAL_MS = 1000        // collect a reading every 1 s during media
const SUMMARY_DISPLAY_MS  = 4000       // show the result card for 4 s then auto-dismiss

type Phase = "notification" | "media" | "summary"

interface DetectionResult {
  emotion: string
  label: string
  score: number
}

interface DailyDropViewerProps {
  drop: DailyDrop
  onDismiss: (dropId: string) => void
  isRecording?: boolean
  recordingDuration?: number
  maxRecordingDuration?: number
  /** Live camera feed ref — used to sample expression frames */
  cameraRef?: RefObject<HTMLVideoElement | null>
}

// Returns the most-frequently-seen emotion from a list of readings
function getDominantEmotion(log: string[]): string | null {
  if (!log.length) return null
  const freq: Record<string, number> = {}
  for (const e of log) freq[e] = (freq[e] ?? 0) + 1
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

export function DailyDropViewer({
  drop,
  onDismiss,
  isRecording,
  recordingDuration = 0,
  maxRecordingDuration = 60,
  cameraRef,
}: DailyDropViewerProps) {
  const [phase, setPhase] = useState<Phase>("notification")
  const videoRef = useRef<HTMLVideoElement>(null)

  // Accumulator — silent during playback
  const emotionLogRef  = useRef<string[]>([])
  const detectingRef   = useRef(false)
  const intervalRef    = useRef<NodeJS.Timeout | null>(null)

  // Final result shown in summary phase
  const [summaryEmotion, setSummaryEmotion] = useState<string | null>(null)

  // ── Transition: notification → media ────────────────────────────────────────
  useEffect(() => {
    if (phase !== "notification") return
    const t = setTimeout(() => setPhase("media"), 3500)
    return () => clearTimeout(t)
  }, [phase])

  // ── Transition: media → summary (auto timeout) ───────────────────────────
  useEffect(() => {
    if (phase !== "media") return
    const duration = drop.media_type !== "video" ? 15000 : 65000
    const t = setTimeout(() => finishMedia(), duration)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, drop])

  // ── Transition: summary → dismiss ───────────────────────────────────────
  useEffect(() => {
    if (phase !== "summary") return
    const dominant = getDominantEmotion(emotionLogRef.current)
    setSummaryEmotion(dominant)

    // Fire & forget the reaction to the backend to trigger push notification
    if (dominant) {
      fetch(`${API_URL}/api/drops/${drop.id}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction_type: dominant })
      }).catch(() => {
        // Silently ignore errors
      })
    }

    const t = setTimeout(() => onDismiss(drop.id), SUMMARY_DISPLAY_MS)
    return () => clearTimeout(t)
  }, [phase, drop.id, onDismiss])

  // Move from media to the summary phase (called by video end or timeout)
  const finishMedia = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setPhase("summary")
  }, [])

  // ── Expression capture loop (runs silently during media phase) ──────────
  const captureAndDetect = useCallback(async () => {
    if (detectingRef.current) return
    const videoEl = cameraRef?.current
    if (!videoEl || videoEl.readyState < 2) return

    detectingRef.current = true
    try {
      const canvas = document.createElement("canvas")
      canvas.width  = videoEl.videoWidth  || 320
      canvas.height = videoEl.videoHeight || 240
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8)
      )
      if (!blob) return

      const form = new FormData()
      form.append("file", blob, "frame.jpg")

      const res = await fetch(`${API_URL}/api/expression/detect`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) return

      const data: DetectionResult = await res.json()
      if (data.emotion && data.emotion !== "none") {
        emotionLogRef.current.push(data.emotion)
      }
    } catch {
      // Best-effort — silent
    } finally {
      detectingRef.current = false
    }
  }, [cameraRef])

  useEffect(() => {
    if (phase !== "media") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    emotionLogRef.current = []   // reset log when media starts
    captureAndDetect()           // immediate first sample
    intervalRef.current = setInterval(captureAndDetect, DETECT_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [phase, captureAndDetect])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleVideoEnd = () => finishMedia()

  // Manual close skips summary and dismisses immediately
  const handleManualClose = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    onDismiss(drop.id)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const glassStyle = {
    background: "rgba(10, 10, 12, 0.72)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow: "0 0 40px 0px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset",
  }

  const emotionCfg = summaryEmotion
    ? (EMOTION_CONFIG[summaryEmotion] ?? EMOTION_CONFIG.neutral)
    : null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8">
      {/* Background dim */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity duration-1000"
        style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      />

      <div className="relative z-10 w-full max-w-sm">

        {/* ── PHASE: notification ── */}
        {phase === "notification" && (
          <div
            className="flex flex-col items-center justify-center gap-4 py-12 px-6 rounded-3xl animate-in fade-in zoom-in duration-700"
            style={glassStyle}
          >
            <div className="relative">
              <Heart
                size={48}
                className="text-pink-400"
                fill="currentColor"
                style={{ filter: "drop-shadow(0 0 12px rgba(244,114,182,0.6))" }}
              />
              <div
                className="absolute inset-0 bg-pink-400 rounded-full blur-2xl opacity-40 animate-pulse"
                style={{ transform: "scale(1.5)" }}
              />
            </div>
            <h2 className="text-xl font-medium text-white text-center mt-2 tracking-wide">
              You have a new memory
            </h2>
            <p className="text-sm text-pink-100/70 uppercase tracking-widest font-semibold">
              Daily Drop
            </p>
          </div>
        )}

        {/* ── PHASE: media ── */}
        {phase === "media" && (
          <div
            className="flex flex-col overflow-hidden rounded-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000"
            style={glassStyle}
          >
            {/* Media content */}
            {drop.image_url && drop.media_type === "video" && (
              <div className="w-full aspect-[4/5] bg-black">
                <video
                  ref={videoRef}
                  src={drop.image_url}
                  autoPlay
                  playsInline
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget
                    if (v.duration) {
                      const pct = (v.currentTime / v.duration) * 100
                      const el = document.getElementById("video-progress")
                      if (el) el.style.width = `${pct}%`
                    }
                  }}
                  onEnded={handleVideoEnd}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {drop.image_url && drop.media_type === "image" && (
              <div className="w-full aspect-[4/5] bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={drop.image_url}
                  alt="Daily drop"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Message */}
            {drop.message_text && (
              <div className="p-6 flex items-start gap-3 bg-gradient-to-t from-black/80 to-black/20">
                <MessageSquare className="text-pink-400 shrink-0 mt-0.5" size={20} />
                <p
                  className="text-white text-base leading-relaxed font-medium"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
                >
                  {drop.message_text}
                </p>
              </div>
            )}

            {/* Top bar */}
            <div className="absolute top-0 left-0 w-full z-20 flex flex-col">
              {isRecording ? (
                <div className="h-6 bg-black/60 w-full overflow-hidden shrink-0 flex items-center justify-center relative">
                  <div
                    className="absolute left-0 top-0 h-full bg-red-500/80 transition-all duration-1000 ease-linear"
                    style={{ width: `${(recordingDuration / maxRecordingDuration) * 100}%` }}
                  />
                  <span className="relative z-10 text-[10px] font-bold text-white tracking-widest drop-shadow-md">
                    MEASURING: {Math.max(0, maxRecordingDuration - recordingDuration)}S LEFT
                  </span>
                </div>
              ) : (
                <div className="h-1.5 bg-black/40 w-full overflow-hidden shrink-0">
                  {drop.media_type !== "video" ? (
                    <div
                      className="h-full bg-pink-500 w-full origin-left"
                      style={{ animation: "shrink 15s linear forwards" }}
                    />
                  ) : (
                    <div id="video-progress" className="h-full bg-pink-500 w-0 transition-all duration-75" />
                  )}
                </div>
              )}

              <div className="flex justify-end p-3">
                <button
                  onClick={handleManualClose}
                  className="bg-black/50 hover:bg-black/70 rounded-full p-2.5 text-white/90 transition-colors backdrop-blur-md border border-white/20 shadow-lg"
                  aria-label="Close daily drop"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Silent capture indicator — very subtle, bottom-right */}
            {cameraRef && (
              <div
                className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                style={{
                  background: "rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"
                  style={{ boxShadow: "0 0 5px 1px rgba(244,114,182,0.6)" }}
                />
                <span className="text-[9px] text-white/30 tracking-widest uppercase font-medium">
                  capturing mood
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── PHASE: summary ── */}
        {phase === "summary" && (
          <div
            className="flex flex-col items-center justify-center gap-5 py-14 px-8 rounded-3xl animate-in fade-in zoom-in duration-700"
            style={{
              ...glassStyle,
              border: emotionCfg
                ? `1px solid ${emotionCfg.color}44`
                : "1px solid rgba(255,255,255,0.15)",
              boxShadow: emotionCfg
                ? `0 0 40px 0 ${emotionCfg.glow}, 0 0 0 1px rgba(255,255,255,0.05) inset`
                : glassStyle.boxShadow,
            }}
          >
            {emotionCfg ? (
              <>
                {/* Big emoji */}
                <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                  <div
                    className="absolute inset-0 rounded-full blur-2xl opacity-30 animate-pulse"
                    style={{ background: emotionCfg.glow }}
                  />
                  <span style={{ fontSize: 64, lineHeight: 1, position: "relative" }}>
                    {emotionCfg.emoji}
                  </span>
                </div>

                {/* Label */}
                <div className="flex flex-col items-center gap-1 text-center">
                  <p
                    className="text-2xl font-bold tracking-tight"
                    style={{
                      color: emotionCfg.color,
                      textShadow: `0 0 24px ${emotionCfg.glow}`,
                    }}
                  >
                    {emotionCfg.label}!
                  </p>
                  <p className="text-sm text-white/40 tracking-wide">
                    {drop.media_type === "video" ? "They saw your video" : "They saw your photo"} and felt{" "}
                    <span style={{ color: emotionCfg.color }}>{emotionCfg.label.toLowerCase()}</span>
                  </p>
                </div>

                {/* Auto-dismiss bar */}
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full origin-left"
                    style={{
                      background: emotionCfg.color,
                      animation: `shrink ${SUMMARY_DISPLAY_MS}ms linear forwards`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* No detection fallback */}
                <span style={{ fontSize: 52 }}>🤍</span>
                <p className="text-white/60 text-base text-center">
                  They watched your drop
                </p>
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden mt-2">
                  <div
                    className="h-full bg-white/30 rounded-full origin-left"
                    style={{ animation: `shrink ${SUMMARY_DISPLAY_MS}ms linear forwards` }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
