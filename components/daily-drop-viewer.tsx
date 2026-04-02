import { useState, useEffect, useRef } from "react"
import { DailyDrop } from "@/hooks/use-daily-drops"
import { Heart, MessageSquare } from "lucide-react"

interface DailyDropViewerProps {
  drop: DailyDrop
  onDismiss: (dropId: string) => void
}

export function DailyDropViewer({ drop, onDismiss }: DailyDropViewerProps) {
  const [phase, setPhase] = useState<"notification" | "media">("notification")
  const videoRef = useRef<HTMLVideoElement>(null)

  // Transition from notification to media
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (phase === "notification") {
      timeout = setTimeout(() => {
        setPhase("media")
      }, 3500)
    }
    return () => clearTimeout(timeout)
  }, [phase])

  // Media duration handling
  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (phase === "media") {
      // If it's an image or text only, auto-dismiss after 15 seconds
      if (drop.media_type !== "video") {
        timeout = setTimeout(() => {
          onDismiss(drop.id)
        }, 15000)
      } else {
        // Fallback for video in case onEnded doesn't fire (e.g. max 65s)
        timeout = setTimeout(() => {
          onDismiss(drop.id)
        }, 65000)
      }
    }
    return () => clearTimeout(timeout)
  }, [phase, drop, onDismiss])

  const handleVideoEnd = () => {
    onDismiss(drop.id)
  }

  // Common glassmorphic container styles
  const glassStyle = {
    background: "rgba(10, 10, 12, 0.7)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow: "0 0 32px 0px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset",
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8">
      {/* Background Dim / Blur */}
      <div 
        className="absolute inset-0 bg-black/60 transition-opacity duration-1000"
        style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      />

      {/* Foreground Content */}
      <div className="relative z-10 w-full max-w-sm">
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
                style={{ filter: "drop-shadow(0 0 12px rgba(244, 114, 182, 0.6))" }}
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

        {phase === "media" && (
          <div 
            className="flex flex-col overflow-hidden rounded-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000"
            style={glassStyle}
          >
            {/* Media Content */}
            {drop.image_url && drop.media_type === "video" && (
              <div className="w-full aspect-[4/5] bg-black">
                <video
                  ref={videoRef}
                  src={drop.image_url}
                  autoPlay
                  playsInline
                  onEnded={handleVideoEnd}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            {drop.image_url && drop.media_type === "image" && (
              <div className="w-full aspect-[4/5] bg-black relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={drop.image_url} 
                  alt="Daily drop" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            {/* Message Area */}
            {drop.message_text && (
              <div className="p-6 flex items-start gap-3 bg-gradient-to-t from-black/80 to-black/20">
                <MessageSquare className="text-pink-400 shrink-0 mt-0.5" size={20} />
                <p className="text-white text-base leading-relaxed font-medium" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                  {drop.message_text}
                </p>
              </div>
            )}
            
            {/* Loading / Progress indicator line */}
            <div className="absolute bottom-0 left-0 h-1 bg-pink-500/50 w-full overflow-hidden">
               {drop.media_type !== "video" && (
                 <div 
                   className="h-full bg-pink-400 w-full origin-left"
                   style={{ 
                     animation: "shrink 15s linear forwards",
                   }}
                 />
               )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
