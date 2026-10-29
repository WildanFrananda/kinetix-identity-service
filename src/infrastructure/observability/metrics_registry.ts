import { Counter, Gauge, Histogram, Registry } from "prom-client"
import { SERVICE_NAME, SERVICE_VERSION } from "./build_identity"
import { ADMIN_ACTION_OUTCOMES, ADMIN_ACTIONS } from "./admin_actions"
import type { AdminAction, AdminActionOutcome } from "../../types/admin_audit.type"
import type { ClientRefusalReason, ClientRefusalSeries } from "../../types/client.type"
import type { GrpcServerCallObservation, HttpRequestObservation } from "../../types/metrics.type"
import type { SignInRole, SignInStage } from "../../types/sign_in_attempt.type"

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

const signInFailuresTotal = new Counter({
  name: "kinetix_identity_sign_in_failures_total",
  help: "Wrong passwords, wrong or reused codes and refused passkeys, by stage and by whether the account is an admin.",
  labelNames: ["stage", "role"] as const,
  registers: [metricsRegistry]
})

const adminActionsTotal = new Counter({
  name: "kinetix_admin_actions_total",
  help: "Admin uses of identity's endpoints, by action and by whether it was done, refused or failed.",
  labelNames: ["action", "outcome"] as const,
  registers: [metricsRegistry]
})

const clientProofRefusalsTotal = new Counter({
  name: "kinetix_identity_client_proof_refusals_total",
  help: "Sign-ins and renewals refused for their client: unknown, unnamed, unproven, or not the session's.",
  labelNames: ["client", "reason"] as const,
  registers: [metricsRegistry]
})

const SIGN_IN_STAGES: readonly SignInStage[] = ["password", "two_factor", "passkey"]

const SIGN_IN_ROLES: readonly SignInRole[] = ["admin", "other"]

buildInfo.set({ service: SERVICE_NAME, version: SERVICE_VERSION }, 1)

for (const stage of SIGN_IN_STAGES) {
  for (const role of SIGN_IN_ROLES) {
    signInFailuresTotal.inc({ stage, role }, 0)
  }
}

for (const action of ADMIN_ACTIONS) {
  for (const outcome of ADMIN_ACTION_OUTCOMES) {
    adminActionsTotal.inc({ action, outcome }, 0)
  }
}

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

function recordSignInFailure(stage: SignInStage, role: SignInRole): void {
  signInFailuresTotal.inc({ stage, role })
}

function recordAdminAction(action: AdminAction, outcome: AdminActionOutcome): void {
  adminActionsTotal.inc({ action, outcome })
}

function declareClientRefusals(series: readonly ClientRefusalSeries[]): void {
  for (const { client, reason } of series) {
    clientProofRefusalsTotal.inc({ client, reason }, 0)
  }
}

function recordClientRefusal(client: string, reason: ClientRefusalReason): void {
  clientProofRefusalsTotal.inc({ client, reason })
}

export {
  declareClientRefusals,
  declareGrpcMethod,
  metricsRegistry,
  recordAdminAction,
  recordClientRefusal,
  recordGrpcServerCall,
  recordHttpRequest,
  recordSignInFailure
}
