import { applyDecorators, SetMetadata, UseInterceptors } from "@nestjs/common"
import AdminAuditInterceptor, { ADMIN_AUDIT_KEY } from "../interceptors/admin_audit.interceptor"
import type { AdminAction, AdminAuditPoint } from "../../types/admin_audit.type"

function AdminAudit(action: AdminAction, targetParam: string | null = null): MethodDecorator {
  const point: AdminAuditPoint = { action, targetParam }

  return applyDecorators(SetMetadata(ADMIN_AUDIT_KEY, point), UseInterceptors(AdminAuditInterceptor))
}

export { AdminAudit }
