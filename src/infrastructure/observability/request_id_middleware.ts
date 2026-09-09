import { Logger } from "@nestjs/common"
import type { IncomingMessage, ServerResponse } from "http"

const HEADER = "x-request-id"

const logger = new Logger("RequestId")

function requestIdMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
): void {
  const header = request.headers[HEADER]
  const requestId = Array.isArray(header) ? header[0] : header

  if (requestId !== undefined && requestId.length > 0) {
    response.setHeader("X-Request-Id", requestId)
  }

  logger.log({
    message: `${request.method} ${request.url}`,
    requestId,
    fields: { method: request.method ?? "", path: request.url ?? "" }
  })

  next()
}

export { requestIdMiddleware, HEADER as REQUEST_ID_HEADER }
