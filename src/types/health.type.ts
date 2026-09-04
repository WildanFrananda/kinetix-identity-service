type LivenessReport = {
  status: string
  service: string
}

type ReadinessReport = {
  status: string
  database: string
}

export type { LivenessReport, ReadinessReport }
