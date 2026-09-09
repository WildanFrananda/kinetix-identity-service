import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { ErrorResponse } from "../../types/error_response.type"
import { REQUEST_ID_HEADER } from "./request_id_middleware"

const NO_REQUEST_ID = "-"

const logger = new Logger("UnhandledException")

@Catch()
class UnhandledExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<FastifyRequest>()
    const reply = context.getResponse<FastifyReply>()
    const requestId = requestIdOf(request)
    const traceId = requestId ?? NO_REQUEST_ID

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()

      logger.warn({
        message: `${request.method} ${request.url} refused with ${status}`,
        requestId,
        fields: { method: request.method, path: request.url, status }
      })

      reply.status(status).send(
        typeof body === "object" && body !== null
          ? { ...body, traceId }
          : { error: "REQUEST_REFUSED", message: String(body), traceId }
      )
      return
    }

    logger.error(
      {
        message: `unhandled exception serving ${request.method} ${request.url}`,
        requestId,
        fields: { method: request.method, path: request.url }
      },
      exception instanceof Error ? exception.stack : String(exception)
    )

    const response: ErrorResponse = {
      error: "INTERNAL_ERROR",
      message:
        "something went wrong handling this request. No account, token or session was changed " +
        "unless a previous response said so.",
      traceId
    }

    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(response)
  }
}

function requestIdOf(request: FastifyRequest): string | null {
  const header = request.headers[REQUEST_ID_HEADER]
  const value = Array.isArray(header) ? header[0] : header
  return value !== undefined && value.length > 0 ? value : null
}

export { UnhandledExceptionFilter }
