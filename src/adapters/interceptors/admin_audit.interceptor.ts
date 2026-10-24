import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { catchError, Observable, tap, throwError } from "rxjs"
import { recordAdminAction } from "../../infrastructure/observability/metrics_registry"
import type { AdminActionOutcome, AdminAuditPoint, AuditedCall } from "../../types/admin_audit.type"
import type { AuthenticatedRequest } from "../../types/request.type"
import { requestIdOf } from "../decorators/request_context.decorator"
import { adminActionOutcomeOf } from "../mappers/admin_action_outcome.mapper"

const ADMIN_AUDIT_KEY = "kinetix:adminAudit"

const UNNAMED_TARGET = "*"

@Injectable()
class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("AdminAudit")

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const point = this.reflector.get<AdminAuditPoint | undefined>(ADMIN_AUDIT_KEY, context.getHandler())
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const claims = request.user

    if (point === undefined || claims === undefined || claims.token_use !== "access" || claims.role !== "admin") {
      return next.handle()
    }

    const call: AuditedCall = {
      action: point.action,
      actor: claims.sub,
      target: point.targetParam === null ? UNNAMED_TARGET : (request.params[point.targetParam] ?? ""),
      requestId: requestIdOf(request.headers)
    }

    return next.handle().pipe(
      tap(() => this.record(call, "done")),
      catchError((error: unknown) => {
        this.record(call, adminActionOutcomeOf(error))
        return throwError(() => error)
      })
    )
  }

  private record(call: AuditedCall, outcome: AdminActionOutcome): void {
    recordAdminAction(call.action, outcome)

    this.logger.log({
      message: "admin_action",
      requestId: call.requestId,
      fields: { event: "admin_action", actor: call.actor, action: call.action, target: call.target, outcome }
    })
  }
}

export default AdminAuditInterceptor
export { ADMIN_AUDIT_KEY }
