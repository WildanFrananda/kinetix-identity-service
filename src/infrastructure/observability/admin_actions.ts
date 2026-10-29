import type { AdminAction, AdminActionOutcome } from "../../types/admin_audit.type"

const ADMIN_ACTIONS: readonly AdminAction[] = [
  "identity.seller_applications_list",
  "identity.seller_applications_tally",
  "identity.seller_application_read",
  "identity.seller_onboard",
  "identity.seller_verify",
  "identity.seller_reject",
  "identity.courier_applications_list",
  "identity.courier_applications_tally",
  "identity.courier_approve",
  "identity.courier_reject",
  "identity.profile_read",
  "identity.profile_update"
]

const ADMIN_ACTION_OUTCOMES: readonly AdminActionOutcome[] = ["done", "refused", "failed"]

export { ADMIN_ACTION_OUTCOMES, ADMIN_ACTIONS }
