import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import { REQUEST_ID_HEADER } from "../../infrastructure/observability/request_id_middleware"
import type { CallContext } from "../../types/call_context.type"
import type { AuthenticatedRequest } from "../../types/request.type"

function requestIdOf(headers: Record<string, string | string[] | undefined>): string | null {
  const header = headers[REQUEST_ID_HEADER]
  const requestId = Array.isArray(header) ? header[0] : header

  return requestId !== undefined && requestId.length > 0 ? requestId : null
}

function callContextOf(request: Pick<AuthenticatedRequest, "headers" | "kinetixClient">): CallContext {
  return { requestId: requestIdOf(request.headers), client: request.kinetixClient ?? null }
}

const RequestContext = createParamDecorator(function (_data: unknown, context: ExecutionContext): CallContext {
  return callContextOf(context.switchToHttp().getRequest<AuthenticatedRequest>())
})

export { callContextOf, RequestContext, requestIdOf }
