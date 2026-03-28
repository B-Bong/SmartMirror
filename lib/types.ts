/**
 * VitalLens API Response Types
 * Matches the backend response from VitalLens integration
 */

export interface VitalValue {
  value: number | null
  unit: string
  confidence: number | null
  note?: string
}

export interface WaveformData {
  data: number[]
  unit: string
  confidence: number[] | number
  note?: string
}

export interface PPGWaveform extends WaveformData {}

export interface RespiratoryWaveform extends WaveformData {}

export interface VitalSigns {
  heart_rate: VitalValue
  respiratory_rate: VitalValue
  hrv_sdnn?: VitalValue
  hrv_rmssd?: VitalValue
  hrv_lfhf?: VitalValue
  ppg_waveform?: PPGWaveform
  respiratory_waveform?: RespiratoryWaveform
}

export interface FaceData {
  confidence: number[] | number
  note?: string
}

export interface HealthAnalysisResponse {
  success: boolean
  vital_signs: VitalSigns
  face: FaceData
  message: string
}

/**
 * Frontend state for health analysis
 */
export interface HealthMetrics {
  heartRate: number | null
  heartRateConfidence: number | null
  respiratoryRate: number | null
  respiratoryRateConfidence: number | null
  hrvSdnn: number | null
  hrvRmssd: number | null
  hrvLfhf: number | null
  faceConfidence: number | null
  isAnalyzing: boolean
  error?: string
  timestamp?: Date
}

export interface RecordingState {
  isRecording: boolean
  duration: number // seconds
  maxDuration: number // seconds (50-60)
}
