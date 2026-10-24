type AdminAction =
  | "identity.seller_applications_list"
  | "identity.seller_application_read"
  | "identity.seller_onboard"
  | "identity.seller_verify"
  | "identity.seller_reject"
  | "identity.courier_applications_list"
  | "identity.courier_approve"
  | "identity.profile_read"
  | "identity.profile_update"

type AdminActionOutcome = "done" | "refused" | "failed"

type AdminAuditPoint = {
  action: AdminAction
  targetParam: string | null
}

type AuditedCall = {
  action: AdminAction
  actor: string
  target: string
  requestId: string | null
}

export type { AdminAction, AdminActionOutcome, AdminAuditPoint, AuditedCall }
