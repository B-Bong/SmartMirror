import { useRef, useState, useCallback } from "react"

export interface UseVideoRecorderOptions {
  maxDuration?: number // in seconds
  mimeType?: string
  onRecordingComplete?: (blob: Blob) => void
  onError?: (error: Error) => void
}

export const useVideoRecorder = (options: UseVideoRecorderOptions = {}) => {
  const {
    maxDuration = 60,
    mimeType = "video/webm;codecs=vp9",
    onRecordingComplete,
    onError
  } = options

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startRecording = useCallback(
    async (stream: MediaStream) => {
      try {
        setError(null)
        chunksRef.current = []
        setDuration(0)

        // Check if MIME type is supported
        const supportedType = MediaRecorder.isTypeSupported(mimeType)
          ? mimeType
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "video/mp4"

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: supportedType,
        })

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: supportedType })
          if (onRecordingComplete) {
            onRecordingComplete(blob)
          }
        }

        mediaRecorder.start()
        mediaRecorderRef.current = mediaRecorder
        setIsRecording(true)

        // Timer to track duration and auto-stop at maxDuration
        let elapsedTime = 0
        timerRef.current = setInterval(() => {
          elapsedTime += 1
          setDuration(elapsedTime)

          if (elapsedTime >= maxDuration) {
            stopRecording()
          }
        }, 1000)
      } catch (err) {
        const error = new Error(
          `Failed to start recording: ${err instanceof Error ? err.message : String(err)}`
        )
        setError(error.message)
        if (onError) {
          onError(error)
        }
      }
    },
    [maxDuration, mimeType, onRecordingComplete, onError]
  )

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  const resetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    chunksRef.current = []
    setDuration(0)
    setError(null)
    setIsRecording(false)
  }, [])

  return {
    isRecording,
    duration,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  }
}
