"use client"

import { useState, useEffect, useRef } from "react"
import { Heart, Wind, Brain, Play, Square, Loader } from "lucide-react"
import { HealthWidget } from "@/components/health-widget"
import { AlignmentGuide } from "@/components/alignment-guide"
import { WellnessWidget } from "@/components/wellness-widget"
import { LedStrip } from "@/components/led-strip"
import { useVideoRecorder } from "@/hooks/use-video-recorder"
import { HealthAnalysisAPI } from "@/lib/health-analysis-api"
import { HealthMetrics } from "@/lib/types"

const RECORDING_DURATION = 50 // seconds

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
  
  // Video recording
  const { isRecording, duration, startRecording, stopRecording, resetRecording } = useVideoRecorder({
    maxDuration: RECORDING_DURATION,
    onRecordingComplete: handleRecordingComplete,
    onError: (err) => setError(err.message),
  })

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
      const wellness = HealthAnalysisAPI.calculateWellnessScore(metrics)
      const stress = HealthAnalysisAPI.estimateStressLevel(metrics)
      
      setWellnessScore(wellness)
      setStressLevel(stress)
      
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
      if (streamRef.current) {
        resetRecording()
        await startRecording(streamRef.current)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    }
  }

  const handleStopRecording = () => {
    stopRecording()
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", frameRate: { ideal: 15 } },
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

        {/* ── Center Alignment Guide ── */}
        <AlignmentGuide scanning={isActive} />

        {/* ── Top metric bar ── */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div
            className="flex items-stretch divide-x"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: "999px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
            }}
          >
            <HealthWidget
              icon={<Heart size={13} strokeWidth={2} className={healthMetrics.heartRate ? "animate-pulse" : ""} />}
              value={healthMetrics.heartRate ? Math.round(healthMetrics.heartRate).toString() : "--"}
              unit="BPM"
              label="Heart"
              accentColor="#f9a8b8"
            />
            <HealthWidget
              icon={<Wind size={13} strokeWidth={2} />}
              value={healthMetrics.respiratoryRate ? Math.round(healthMetrics.respiratoryRate).toString() : "--"}
              unit="br/m"
              label="Resp"
              accentColor="#7dd3e8"
            />
            <WellnessWidget score={wellnessScore} />
            <HealthWidget
              icon={<Brain size={13} strokeWidth={2} />}
              value={stressLevel}
              label="Stress"
              accentColor="#c4b5fd"
            />
          </div>
        </div>

        {/* ── Recording Duration Display ── */}
        {isRecording && (
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 z-40">
            <div
              className="flex flex-col items-center justify-center gap-4 px-8 py-6 rounded-2xl"
              style={{
                background: "rgba(0,0,0,0.7)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              <div className="text-center">
                <p className="text-sm font-medium text-gray-300 mb-2">Recording...</p>
                <p className="text-4xl font-bold text-red-400">{duration}s</p>
                <p className="text-xs text-gray-400 mt-1">
                  {RECORDING_DURATION - duration}s remaining
                </p>
              </div>
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

        {/* ── Frame Rate Display (Bottom Left) ── */}
        {isActive && (
          <div className="absolute bottom-6 left-6 z-20">
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

          {isRecording && (
            <button
              onClick={handleStopRecording}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                background: "rgba(239, 68, 68, 0.3)",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                color: "#fca5a5",
                boxShadow: "0 0 16px 0px rgba(239, 68, 68, 0.3), 0 0 0 0.5px rgba(239, 68, 68, 0.4) inset",
              }}
            >
              <Square size={16} fill="currentColor" />
              <span>Stop & Analyze</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
