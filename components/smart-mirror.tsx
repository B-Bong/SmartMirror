"use client"

import { useState, useEffect, useRef } from "react"
import { Play, Square, Loader } from "lucide-react"
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

const RECORDING_DURATION = 90 // seconds

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

  // Daily Drops
  const { currentDrop, markAsViewed } = useDailyDrops()

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
      const response = await HealthAnalysisAPI.uploadVideo(videoBlob)

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
    }
  }

  const handleStartRecording = async () => {
    try {
      setError(null)
      setShowReport(false)
      if (streamRef.current) {
        resetRecording()
        await startRecording(streamRef.current)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    }
  }


  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", frameRate: { ideal: 15, max: 15 } },
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCurrentFps(0)
    setIsActive(false)
  }

  const toggleCamera = isActive ? stopCamera : startCamera

  // Auto-start camera on mount so fall detection begins immediately
  useEffect(() => {
    startCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trigger fall alert whenever a fall is first detected
  useEffect(() => {
    if (fallDetected || globalFallDetected) {
      setFallAlertActive(true)
      setFallAlertDetectedAt(new Date())
      // Prefer per-person fall label; only flag as global if no in-frame fall
      setFallAlertIsGlobal(!fallDetected && globalFallDetected)
    }
  }, [fallDetected, globalFallDetected])

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
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

        {/* ── Health Report (post-scan) ── */}
        {showReport && !healthMetrics.isAnalyzing && (
          <HealthReport
            metrics={healthMetrics}
            wellnessScore={wellnessScore}
            stressLevel={stressLevel}
            onDismiss={() => setShowReport(false)}
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
          {/* Camera Toggle */}
          <button
            onClick={toggleCamera}
            disabled={isRecording || healthMetrics.isAnalyzing}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isActive
                ? "rgba(239, 68, 68, 0.2)"
                : "rgba(34, 197, 94, 0.2)",
              border: isActive
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : "1px solid rgba(34, 197, 94, 0.4)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              color: isActive ? "#fca5a5" : "#86efac",
              boxShadow: isActive
                ? "0 0 16px 0px rgba(239, 68, 68, 0.2), 0 0 0 0.5px rgba(239, 68, 68, 0.3) inset"
                : "0 0 16px 0px rgba(34, 197, 94, 0.2), 0 0 0 0.5px rgba(34, 197, 94, 0.3) inset",
            }}
          >
            {isActive ? (
              <>
                <Square size={16} fill="currentColor" />
                <span>Stop Camera</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Start Camera</span>
              </>
            )}
          </button>

          {/* Recording Controls */}
          {isActive && !isRecording && (
            <button
              onClick={handleStartRecording}
              disabled={healthMetrics.isAnalyzing}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                color: "#93c5fd",
                boxShadow: "0 0 16px 0px rgba(59, 130, 246, 0.2), 0 0 0 0.5px rgba(59, 130, 246, 0.3) inset",
              }}
            >
              <Play size={16} fill="currentColor" />
              <span>Record</span>
            </button>
          )}


        </div>
      </div>
    </div>
  )
}
