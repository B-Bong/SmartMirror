"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Play, Square, Loader, ScanFace } from "lucide-react"
import { AlignmentGuide } from "@/components/alignment-guide"
import { LedStrip } from "@/components/led-strip"
import { AmbientBar } from "@/components/ambient-bar"
import { HealthReport } from "@/components/health-report"
import { FallAlert } from "@/components/fall-alert"
import { useVideoRecorder } from "@/hooks/use-video-recorder"
import { useFallDetection } from "@/hooks/use-fall-detection"
import { HealthAnalysisAPI } from "@/lib/health-analysis-api"
import { HealthMetrics } from "@/lib/types"
import { useDailyDrops } from "@/hooks/use-daily-drops"
import { DailyDropViewer } from "@/components/daily-drop-viewer"

const RECORDING_DURATION = 60 // seconds

export default function SmartMirror() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending")
  const [isActive, setIsActive] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [currentFps, setCurrentFps] = useState(0)

  // Health metrics state
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics>({
    heartRate: null,
    heartRateConfidence: null,
    respiratoryRate: null,
    respiratoryRateConfidence: null,
    hrvSdnn: null,
    hrvRmssd: null,
    hrvLfhf: null,
    faceConfidence: null,
    isAnalyzing: false,
  })
  const [wellnessScore, setWellnessScore] = useState(85)
  const [stressLevel, setStressLevel] = useState<"Low" | "Moderate" | "High">("Low")
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  // Fall detection alert state
  const [fallAlertActive, setFallAlertActive] = useState(false)
  const [fallAlertDetectedAt, setFallAlertDetectedAt] = useState<Date | null>(null)
  const [fallAlertIsGlobal, setFallAlertIsGlobal] = useState(false)

  // Authentication state
  const [recognizedUser, setRecognizedUser] = useState<string | null>(null)
  const [recognizedLastName, setRecognizedLastName] = useState<string | null>(null)
  const [isGuestUser, setIsGuestUser] = useState(false)

  // Mirror flow state machine:
  //   idle → scanning (10 s face scan) → welcoming (greeting shown) → countdown (5 s) → recording
  const [mirrorPhase, setMirrorPhase] = useState<"idle" | "scanning" | "welcoming" | "countdown" | "recording" | "done">("idle")
  const [scanSecondsLeft, setScanSecondsLeft] = useState(10)

  // Pre-recording countdown state
  const [preRecordCountdown, setPreRecordCountdown] = useState<number | null>(null)
  const preRecordTimerRef = useRef<NodeJS.Timeout | null>(null)
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionAttemptRef = useRef<boolean>(false)

  // Daily Drops
  const { currentDrop, markAsViewed } = useDailyDrops(recognizedUser)

  // Video recording
  const { isRecording, duration, startRecording, stopRecording, resetRecording } = useVideoRecorder({
    maxDuration: RECORDING_DURATION,
    onRecordingComplete: handleRecordingComplete,
    onError: (err) => setError(err.message),
  })

  // Fall detection — runs whenever the camera is active
  const { fallDetected, globalFallDetected, peopleCount, isConnected: fallMonitorConnected } =
    useFallDetection(videoRef, isActive)

  async function handleRecordingComplete(videoBlob: Blob) {
    try {
      setError(null)
      setHealthMetrics((prev) => ({ ...prev, isAnalyzing: true }))

      // Upload video to backend
      const response = await HealthAnalysisAPI.uploadVideo(videoBlob, recognizedUser || undefined)

      // Parse response and update metrics
      const metrics = HealthAnalysisAPI.parseResponse(response)
      setHealthMetrics(metrics)

      // Calculate wellness score and stress level
      const wellness = HealthAnalysisAPI.calculateWellnessScore(metrics, response)
      const stress = HealthAnalysisAPI.estimateStressLevel(metrics, response)

      setWellnessScore(wellness)
      setStressLevel(stress)
      setShowReport(true)

      console.log("[SmartMirror] Analysis complete:", { metrics, wellness, stress })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      console.error("[SmartMirror] Analysis error:", errorMessage)
    } finally {
      setHealthMetrics((prev) => ({ ...prev, isAnalyzing: false }))
      resetRecording()
      // Phase transitions to "done" — user dismisses the report manually
      setMirrorPhase("done")
    }
  }

  // Called when user closes the health report — return to idle ready state
  const handleDismissReport = useCallback(() => {
    setShowReport(false)
    setRecognizedUser(null)
    setRecognizedLastName(null)
    setIsGuestUser(false)
    setMirrorPhase("idle")
    setScanSecondsLeft(10)
    recognitionAttemptRef.current = false
  }, [])

  const handleStartRecording = useCallback(async () => {
    try {
      setError(null)
      setShowReport(false)
      if (streamRef.current) {
        resetRecording()
        setMirrorPhase("recording")
        await startRecording(streamRef.current)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      setMirrorPhase("idle")
    }
  }, [resetRecording, startRecording])

  // Kick off the 5-second stand-still countdown after welcoming phase
  const beginPreRecordCountdown = useCallback(() => {
    if (preRecordTimerRef.current) return // already counting
    setMirrorPhase("countdown")
    setPreRecordCountdown(5)
  }, [])

  // Begin the 10-second face-scan phase
  const beginScanPhase = useCallback(() => {
    setMirrorPhase("scanning")
    setScanSecondsLeft(10)
    recognitionAttemptRef.current = false
  }, [])


  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          frameRate: { ideal: 15, max: 15 },
          width:  { ideal: 1280, min: 640 },  // request 720p, accept >=480p
          height: { ideal: 720,  min: 480 },
        },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setCameraPermission("granted")
        setIsActive(true)

        // Get actual camera frame rate from stream
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.frameRate) {
            setCurrentFps(Math.round(settings.frameRate))
          }
        }
      }
    } catch (error) {
      console.error("[SmartMirror] Camera access denied:", error)
      setCameraPermission("denied")
      setIsActive(false)
    }
  }

  const stopCamera = () => {
    if (preRecordTimerRef.current) {
      clearInterval(preRecordTimerRef.current)
      preRecordTimerRef.current = null
    }
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    setPreRecordCountdown(null)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCurrentFps(0)
    setIsActive(false)
    setRecognizedUser(null)
    setRecognizedLastName(null)
    setIsGuestUser(false)
    setMirrorPhase("idle")
    setScanSecondsLeft(10)
    recognitionAttemptRef.current = false
  }

  const toggleCamera = isActive ? stopCamera : startCamera

  // Auto-start camera on mount so fall detection begins immediately
  useEffect(() => {
    startCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 10-second face-scan phase ────────────────────────────────────────────
  // Scanning begins ONLY when beginScanPhase() is called (user presses button).
  // No auto-trigger; the idle state shows the "Start Session" button.

  useEffect(() => {
    if (mirrorPhase !== "scanning") return

    // Countdown tick
    if (scanSecondsLeft <= 0) {
      // Time is up — treat as guest
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
        scanTimerRef.current = null
      }
      setIsGuestUser(true)
      setMirrorPhase("welcoming")
      return
    }

    const tick = setTimeout(() => setScanSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(tick)
  }, [mirrorPhase, scanSecondsLeft])

  // Attempt recognition repeatedly while scanning
  useEffect(() => {
    if (mirrorPhase !== "scanning") return
    if (recognitionAttemptRef.current) return // already running an attempt

    const attemptRecognition = async () => {
      if (!videoRef.current || mirrorPhase !== "scanning") return
      recognitionAttemptRef.current = true

      try {
        const canvas = document.createElement("canvas")
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.9)
        )
        if (!blob) return

        const result = await HealthAnalysisAPI.authenticateUser(blob)
        if (result.success && result.elderly_id) {
          // Recognised — transition to welcoming phase
          setRecognizedUser(result.elderly_id)
          setRecognizedLastName(result.last_name || null)
          setIsGuestUser(false)
          setMirrorPhase("welcoming")
          return
        }
      } catch {
        // Silently retry on error
      } finally {
        recognitionAttemptRef.current = false
      }

      // Not recognised yet — wait 2 s then retry
      if (mirrorPhase === "scanning") {
        setTimeout(() => {
          recognitionAttemptRef.current = false
        }, 2000)
      }
    }

    attemptRecognition()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorPhase, scanSecondsLeft])

  // ── Welcoming phase: show greeting for 3 s, then start countdown ─────────
  useEffect(() => {
    if (mirrorPhase !== "welcoming") return
    const welcomeTimer = setTimeout(() => beginPreRecordCountdown(), 3000)
    return () => clearTimeout(welcomeTimer)
  }, [mirrorPhase, beginPreRecordCountdown])

  // Trigger fall alert whenever a fall is first detected
  useEffect(() => {
    if (fallDetected || globalFallDetected) {
      setFallAlertActive(true)
      setFallAlertDetectedAt(new Date())
      // Prefer per-person fall label; only flag as global if no in-frame fall
      setFallAlertIsGlobal(!fallDetected && globalFallDetected)
    }
  }, [fallDetected, globalFallDetected])

  // Pre-recording countdown tick
  useEffect(() => {
    if (preRecordCountdown === null) return

    if (preRecordCountdown === 0) {
      // Countdown finished — start the actual recording
      setPreRecordCountdown(null)
      handleStartRecording()
      return
    }

    preRecordTimerRef.current = setTimeout(() => {
      setPreRecordCountdown((c) => (c !== null ? c - 1 : null))
    }, 1000)

    return () => {
      if (preRecordTimerRef.current) {
        clearTimeout(preRecordTimerRef.current)
        preRecordTimerRef.current = null
      }
    }
  }, [preRecordCountdown, handleStartRecording])

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (preRecordTimerRef.current) {
        clearTimeout(preRecordTimerRef.current)
      }
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center font-sans overflow-hidden">
      {/* Global keyframes for the alignment guide pulse */}
      <style>{`
        @keyframes mirror-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* 2:3 aspect-ratio mirror frame */}
      <div
        className="relative overflow-hidden bg-black"
        style={{
          aspectRatio: "2 / 3",
          height: "min(100vh, 100vw * 1.5)",
          width: "min(100vw, 100vh * 0.6667)",
          maxHeight: "100vh",
          maxWidth: "100vw",
        }}
      >
        {/* Video background with mirror effect */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: "scaleX(-1)",
            display: isActive ? "block" : "none",
          }}
        />

        {/* Fallback when camera not active — subtle dark gradient */}
        {!isActive && (
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 40%, rgba(20,28,36,1) 0%, rgba(6,8,10,1) 100%)",
            }}
          />
        )}

        {/* Fallback for permission denied */}
        {cameraPermission === "denied" && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", letterSpacing: "0.06em" }}>
              Camera access denied
            </p>
          </div>
        )}

        {/* ── LEFT LED strip ── */}
        <LedStrip side="left" scanning={isActive} />

        {/* ── RIGHT LED strip ── */}
        <LedStrip side="right" scanning={isActive} />

        {/* ── Center Alignment Guide (only while recording) ── */}
        {isRecording && <AlignmentGuide scanning={true} />}

        {/* ── Ambient Bar: Weather + Clock ── */}
        <AmbientBar />

        {/* ── Recording Countdown Display ── */}
        {isRecording && (
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 z-40">
            <div
              className="flex flex-col items-center justify-center gap-3 px-8 py-6 rounded-2xl"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              {/* Circular countdown ring */}
              <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                <svg
                  width="96"
                  height="96"
                  style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}
                >
                  {/* Background track */}
                  <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                  {/* Countdown arc — shrinks as time passes */}
                  <circle
                    cx="48"
                    cy="48"
                    r="42"
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (duration / RECORDING_DURATION)}`}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-bold text-red-400" style={{ lineHeight: 1 }}>
                    {Math.max(0, RECORDING_DURATION - duration)}
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">sec</span>
                </div>
              </div>
              {/* Label */}
              <p className="text-xs font-medium tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>
                Recording
              </p>
            </div>
          </div>
        )}

        {/* ── Analysis Status ── */}
        {healthMetrics.isAnalyzing && (
          <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/40 backdrop-blur">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader size={48} className="text-blue-400 animate-spin" />
              <p className="text-lg font-medium text-white">Analyzing vital signs...</p>
              <p className="text-sm text-gray-300">This may take a minute</p>
            </div>
          </div>
        )}

        {/* ── Scanning Phase Overlay ── */}
        {mirrorPhase === "scanning" && !isRecording && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40">
            <div
              className="flex flex-col items-center gap-3 px-7 py-4 rounded-2xl"
              style={{
                background: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
            >
              {/* Animated scanning rings */}
              <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
                <svg width="56" height="56" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
                  <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                  <circle
                    cx="28" cy="28" r="23"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 23}`}
                    strokeDashoffset={`${2 * Math.PI * 23 * (1 - scanSecondsLeft / 10)}`}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <span className="text-xl font-bold" style={{ color: "#93c5fd", lineHeight: 1 }}>
                  {scanSecondsLeft}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-sm font-semibold tracking-wide" style={{ color: "#bfdbfe" }}>
                  Scanning face...
                </p>
                <p className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.38)" }}>
                  Please look at the mirror
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Welcoming Phase Overlay ── */}
        {mirrorPhase === "welcoming" && !isRecording && (
          <div
            className="absolute inset-0 flex items-center justify-center z-40"
            style={{ background: "rgba(0,0,0,0.50)", backdropFilter: "blur(4px)" }}
          >
            <div
              className="flex flex-col items-center gap-4 px-12 py-10 rounded-3xl"
              style={{
                background: isGuestUser
                  ? "rgba(15,15,30,0.88)"
                  : "rgba(10,20,15,0.88)",
                border: isGuestUser
                  ? "1px solid rgba(148,163,184,0.2)"
                  : "1px solid rgba(52,211,153,0.25)",
                backdropFilter: "blur(32px)",
                WebkitBackdropFilter: "blur(32px)",
                boxShadow: isGuestUser
                  ? "0 0 60px 0 rgba(148,163,184,0.12)"
                  : "0 0 60px 0 rgba(52,211,153,0.18)",
              }}
            >
              {/* Wave emoji */}
              <span style={{ fontSize: 52 }}>👋</span>

              {/* Greeting */}
              <div className="flex flex-col items-center gap-1 text-center">
                <p
                  className="text-3xl font-bold tracking-tight"
                  style={{
                    color: isGuestUser ? "#e2e8f0" : "#6ee7b7",
                    textShadow: isGuestUser
                      ? "0 0 20px rgba(226,232,240,0.3)"
                      : "0 0 20px rgba(110,231,183,0.45)",
                  }}
                >
                  {isGuestUser
                    ? "Welcome, Guest!"
                    : `Welcome, ${recognizedLastName || "User"}!`}
                </p>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {isGuestUser
                    ? "Measurement will start shortly."
                    : "Great to see you again!"}
                </p>
              </div>

              {/* Measurement starting notice */}
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium tracking-wide"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                <Loader size={12} className="animate-spin" />
                Measurement starting in a moment...
              </div>
            </div>
          </div>
        )}

        {/* ── Pre-Recording Stand-Still Countdown ── */}
        {preRecordCountdown !== null && mirrorPhase === "countdown" && !isRecording && (
          <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
            <div
              className="flex flex-col items-center justify-center gap-5 px-10 py-8 rounded-3xl"
              style={{
                background: "rgba(10,10,20,0.82)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(32px)",
                WebkitBackdropFilter: "blur(32px)",
                boxShadow: "0 0 60px 0 rgba(99,102,241,0.18)",
              }}
            >
              {/* Large pulsing countdown number */}
              <div
                className="relative flex items-center justify-center"
                style={{ width: 120, height: 120 }}
              >
                <svg width="120" height="120" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                  <circle
                    cx="60" cy="60" r="52"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - preRecordCountdown / 5)}`}
                    style={{ transition: "stroke-dashoffset 0.85s linear" }}
                  />
                </svg>
                <span
                  className="text-6xl font-bold"
                  style={{
                    color: "#c7d2fe",
                    lineHeight: 1,
                    textShadow: "0 0 24px rgba(129,140,248,0.7)",
                    animation: "mirror-pulse 0.9s ease-in-out infinite",
                  }}
                >
                  {preRecordCountdown}
                </span>
              </div>

              {/* Instruction text */}
              <div className="flex flex-col items-center gap-1">
                <p className="text-lg font-semibold tracking-wide" style={{ color: "#e0e7ff" }}>
                  Please stand still
                </p>
                <p className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Recording begins shortly
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Health Report (post-scan) ── */}
        {showReport && !healthMetrics.isAnalyzing && (
          <HealthReport
            metrics={healthMetrics}
            wellnessScore={wellnessScore}
            stressLevel={stressLevel}
            onDismiss={handleDismissReport}
          />
        )}

        {/* ── Fall Alert Overlay ── */}
        {fallAlertActive && fallAlertDetectedAt && (
          <FallAlert
            detectedAt={fallAlertDetectedAt}
            isGlobal={fallAlertIsGlobal}
            onDismiss={() => setFallAlertActive(false)}
          />
        )}

        {/* ── Daily Drop Overlay ── */}
        {currentDrop && (
          <DailyDropViewer
            drop={currentDrop}
            onDismiss={markAsViewed}
          />
        )}

        {/* ── Error Message ── */}
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 w-4/5 max-w-sm">
            <div
              className="px-4 py-3 rounded-lg text-sm text-red-200 border"
              style={{
                background: "rgba(127, 29, 29, 0.2)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                backdropFilter: "blur(12px)",
              }}
            >
              {error}
            </div>
          </div>
        )}

        {/* ── Bottom‑Left Status Column: Fall Monitor + FPS ── */}
        {isActive && (
          <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2 items-start">

            {/* Fall monitor status badge */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
              style={{
                background: "rgba(0,0,0,0.55)",
                border: fallMonitorConnected
                  ? "1px solid rgba(74, 222, 128, 0.35)"
                  : "1px solid rgba(250, 204, 21, 0.35)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                color: fallMonitorConnected ? "#86efac" : "#fde047",
              }}
            >
              {/* Pulsing status dot */}
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: fallMonitorConnected ? "#4ade80" : "#facc15",
                  boxShadow: fallMonitorConnected
                    ? "0 0 6px 2px rgba(74,222,128,0.6)"
                    : "0 0 6px 2px rgba(250,204,21,0.5)",
                  animation: fallMonitorConnected ? "mirror-pulse 2s ease-in-out infinite" : "none",
                }}
              />
              {fallMonitorConnected
                ? `Fall Monitor · ${peopleCount} detected`
                : "Fall Monitor · connecting"}
            </div>

            {/* FPS badge */}
            <div
              className="px-3 py-2 rounded-lg text-xs font-mono"
              style={{
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(147, 197, 253, 0.3)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                color: "#93c5fd",
              }}
            >
              {currentFps} FPS
            </div>

          </div>
        )}

        {/* ── Center Bottom: Control Buttons ── */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4">

          {/* Camera toggle — only shown in idle/done state or when camera is off */}
          {(mirrorPhase === "idle" || mirrorPhase === "done" || !isActive) && !isRecording && !healthMetrics.isAnalyzing && (
            <button
              onClick={toggleCamera}
              disabled={isRecording || healthMetrics.isAnalyzing}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isActive
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(34, 197, 94, 0.2)",
                border: isActive
                  ? "1px solid rgba(239, 68, 68, 0.35)"
                  : "1px solid rgba(34, 197, 94, 0.4)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                color: isActive ? "#fca5a5" : "#86efac",
                boxShadow: isActive
                  ? "0 0 16px 0px rgba(239, 68, 68, 0.15), 0 0 0 0.5px rgba(239, 68, 68, 0.25) inset"
                  : "0 0 16px 0px rgba(34, 197, 94, 0.2), 0 0 0 0.5px rgba(34, 197, 94, 0.3) inset",
              }}
            >
              {isActive ? (
                <>
                  <Square size={16} fill="currentColor" />
                  <span>Stop Mirror</span>
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" />
                  <span>Start Mirror</span>
                </>
              )}
            </button>
          )}

          {/* ── Start Session button — shown when camera is on and idle ── */}
          {isActive && (mirrorPhase === "idle" || mirrorPhase === "done") && !isRecording && !healthMetrics.isAnalyzing && (
            <button
              id="start-session-btn"
              onClick={() => beginScanPhase()}
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(139,92,246,0.35) 100%)",
                border: "1px solid rgba(167,139,250,0.5)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                color: "#c4b5fd",
                boxShadow: "0 0 28px 0px rgba(139,92,246,0.3), 0 0 0 0.5px rgba(167,139,250,0.35) inset",
                fontSize: "0.9rem",
                letterSpacing: "0.02em",
              }}
            >
              <ScanFace size={18} />
              <span>Start Session</span>
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
