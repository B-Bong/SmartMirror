import { HealthAnalysisResponse, HealthMetrics } from "@/lib/types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export class HealthAnalysisAPI {
  static async uploadVideo(videoBlob: Blob): Promise<HealthAnalysisResponse> {
    try {
      const formData = new FormData()
      formData.append("file", videoBlob, "video.webm")

      const response = await fetch(`${API_BASE_URL}/api/health/process-video`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail ||
            `API error: ${response.status} ${response.statusText}`
        )
      }

      return await response.json()
    } catch (error) {
      throw new Error(
        `Failed to upload video: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  static async uploadVideoBase64(
    videoBase64: string,
    filename: string
  ): Promise<HealthAnalysisResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/health/process-video-base64`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            video: videoBase64,
            filename: filename,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail ||
            `API error: ${response.status} ${response.statusText}`
        )
      }

      return await response.json()
    } catch (error) {
      throw new Error(
        `Failed to upload video: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  static parseResponse(response: HealthAnalysisResponse): HealthMetrics {
    return {
      heartRate: response.vital_signs.heart_rate.value,
      heartRateConfidence: response.vital_signs.heart_rate.confidence,
      respiratoryRate: response.vital_signs.respiratory_rate.value,
      respiratoryRateConfidence: response.vital_signs.respiratory_rate.confidence,
      hrvSdnn: response.vital_signs.hrv_sdnn?.value || null,
      hrvRmssd: response.vital_signs.hrv_rmssd?.value || null,
      hrvLfhf: response.vital_signs.hrv_lfhf?.value || null,
      faceConfidence:
        typeof response.face.confidence === "number"
          ? response.face.confidence
          : Array.isArray(response.face.confidence)
            ? response.face.confidence[0] || null
            : null,
      isAnalyzing: false,
      timestamp: new Date(),
    }
  }

  static calculateWellnessScore(metrics: HealthMetrics, rawResponse?: HealthAnalysisResponse): number {
    if (rawResponse?.summary?.wellness_score !== undefined) {
      return rawResponse.summary.wellness_score
    }
    // Simple wellness score based on vital signs (30% HR, 30% RR, 25% HRV, 15% Confidence)
    const components: number[] = []

    // Heart rate score (Target 75 bpm)
    if (metrics.heartRate) {
      const hrScore = Math.max(0, 100 - Math.abs(metrics.heartRate - 75) / 0.5)
      components.push(hrScore * 0.3)
    } else components.push(0)

    // Respiratory rate score (Target 16 rpm)
    if (metrics.respiratoryRate) {
      const rrScore = Math.max(0, 100 - Math.abs(metrics.respiratoryRate - 16) / 0.25)
      components.push(rrScore * 0.3)
    } else components.push(0)

    // HRV (SDNN) score (Target 55ms+)
    if (metrics.hrvSdnn) {
      const hrvScore = Math.min(100, Math.max(0, (metrics.hrvSdnn - 15) * 2.5))
      components.push(hrvScore * 0.25)
    } else components.push(40 * 0.25) // penalty fallback for no HRV

    // Confidence component
    const avgConfidence = (
      [
        metrics.heartRateConfidence,
        metrics.respiratoryRateConfidence,
        metrics.faceConfidence,
      ].filter((c) => c !== null) as number[]
    ).reduce((a, b) => a + b, 0) / 3
    
    components.push((avgConfidence || 0.8) * 15)

    return Math.round(components.reduce((a, b) => a + b, 0))
  }

  static estimateStressLevel(metrics: HealthMetrics, rawResponse?: HealthAnalysisResponse): "Low" | "Moderate" | "High" {
    if (rawResponse?.summary?.stress_level) {
      return rawResponse.summary.stress_level
    }
    // Simple stress estimation based on heart rate and HRV
    if (!metrics.heartRate) return "Moderate"

    if (metrics.heartRate > 100) {
      return "High"
    } else if (metrics.heartRate > 90 || metrics.hrvSdnn === null) {
      return "Moderate"
    }
    return "Low"
  }
}
