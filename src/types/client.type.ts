type ClientProofKind = "app_check" | "none"

type AttestedClient = {
  name: string
  proof: "app_check"
  appIds: ReadonlySet<string>
}

type RegisteredClient = { name: string; proof: "none" } | AttestedClient

type UnnamedClientPolicy = "allow" | "refuse"

type ClientRegistry = {
  clients: ReadonlyMap<string, RegisteredClient>
  unnamed: UnnamedClientPolicy
  firebaseProjectNumber: string | null
}

type RequestClient = { kind: "named"; name: string } | { kind: "unnamed" }

type SessionClientDecision = "continue" | "bind" | "mismatch"

type ProofRefusalReason =
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "not_yet_valid"
  | "wrong_project"
  | "wrong_app_id"
  | "keys_unavailable"

type ClientRefusalReason = ProofRefusalReason | "unknown_client" | "client_required" | "client_mismatch"

type ClientRefusalSeries = {
  client: string
  reason: ClientRefusalReason
}

export type {
  AttestedClient,
  ClientProofKind,
  ClientRefusalReason,
  ClientRefusalSeries,
  ClientRegistry,
  ProofRefusalReason,
  RegisteredClient,
  RequestClient,
  SessionClientDecision,
  UnnamedClientPolicy
}
