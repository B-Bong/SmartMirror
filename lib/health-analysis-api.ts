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

  static calculateWellnessScore(metrics: HealthMetrics): number {
    // Simple wellness score based on vital signs
    // Scale 0-100
    const components: number[] = []

    // Heart rate score (60-100 bpm is ideal)
    if (metrics.heartRate) {
      const hrScore = Math.max(
        0,
        Math.min(100, 100 - Math.abs(metrics.heartRate - 80) / 0.4)
      )
      if (metrics.heartRateConfidence && metrics.heartRateConfidence > 0.7) {
        components.push(hrScore)
      }
    }

    // Respiratory rate score (12-20 rpm is ideal)
    if (metrics.respiratoryRate) {
      const rrScore = Math.max(
        0,
        Math.min(100, 100 - Math.abs(metrics.respiratoryRate - 16) / 0.4)
      )
      if (
        metrics.respiratoryRateConfidence &&
        metrics.respiratoryRateConfidence > 0.7
      ) {
        components.push(rrScore)
      }
    }

    // Confidence score
    const avgConfidence = (
      [
        metrics.heartRateConfidence,
        metrics.respiratoryRateConfidence,
        metrics.faceConfidence,
      ].filter((c) => c !== null && c !== undefined) as number[]
    ).reduce((a, b) => a + b, 0) / 3
    components.push(avgConfidence * 100)

    // Return average score
    return components.length > 0
      ? Math.round(components.reduce((a, b) => a + b, 0) / components.length)
      : 0
  }

  static estimateStressLevel(metrics: HealthMetrics): "Low" | "Moderate" | "High" {
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
