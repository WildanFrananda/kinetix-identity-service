import { HttpException } from "@nestjs/common"
import MissingReferenceError from "../../domain/errors/missing_reference.error"
import RecordConflictError from "../../domain/errors/record_conflict.error"
import type { AdminActionOutcome } from "../../types/admin_audit.type"

function adminActionOutcomeOf(error: unknown): AdminActionOutcome {
  if (error instanceof HttpException) {
    return error.getStatus() < 500 ? "refused" : "failed"
  }

  if (error instanceof RecordConflictError || error instanceof MissingReferenceError) {
    return "refused"
  }

  return "failed"
}

export { adminActionOutcomeOf }
