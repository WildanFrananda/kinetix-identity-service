import { Counter, Gauge, Histogram, Registry } from "prom-client"
import { SERVICE_NAME, SERVICE_VERSION } from "./build_identity"
import type { GrpcServerCallObservation, HttpRequestObservation } from "../../types/metrics.type"

const metricsRegistry = new Registry()

const DURATION_BUCKETS_SECONDS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
]

const httpRequestsTotal = new Counter({
  name: "kinetix_http_requests_total",
  help: "HTTP requests served, by method, matched route template and response status.",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry]
})

const httpRequestDurationSeconds = new Histogram({
  name: "kinetix_http_request_duration_seconds",
  help: "Seconds spent serving an HTTP request, from arrival to the last byte of the response.",
  labelNames: ["method", "route"] as const,
  buckets: [...DURATION_BUCKETS_SECONDS],
  registers: [metricsRegistry]
})

const grpcServerCallsTotal = new Counter({
  name: "kinetix_grpc_server_calls_total",
  help: "gRPC calls this server answered, by method path and the status code it returned.",
  labelNames: ["grpc_method", "grpc_code"] as const,
  registers: [metricsRegistry]
})

const buildInfo = new Gauge({
  name: "kinetix_build_info",
  help: "Always 1. The labels say which build answered this scrape.",
  labelNames: ["service", "version"] as const,
  registers: [metricsRegistry]
})

buildInfo.set({ service: SERVICE_NAME, version: SERVICE_VERSION }, 1)

function recordHttpRequest(observation: HttpRequestObservation): void {
  const status = String(observation.status)
  httpRequestsTotal.inc({ method: observation.method, route: observation.route, status })
  httpRequestDurationSeconds.observe(
    { method: observation.method, route: observation.route },
    observation.durationSeconds
  )
}

function recordGrpcServerCall(observation: GrpcServerCallObservation): void {
  grpcServerCallsTotal.inc({
    grpc_method: observation.grpcMethod,
    grpc_code: observation.grpcCode
  })
}

function declareGrpcMethod(grpcMethod: string): void {
  grpcServerCallsTotal.inc({ grpc_method: grpcMethod, grpc_code: "OK" }, 0)
}

export { declareGrpcMethod, metricsRegistry, recordGrpcServerCall, recordHttpRequest }
