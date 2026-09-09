type HttpRequestObservation = {
  method: string
  route: string
  status: number
  durationSeconds: number
}

type GrpcServerCallObservation = {
  grpcMethod: string
  grpcCode: string
}

export type { GrpcServerCallObservation, HttpRequestObservation }
