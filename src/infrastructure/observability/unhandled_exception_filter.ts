import {
  Catch,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException
} from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common"
import type { FastifyReply, FastifyRequest } from "fastify"
import MissingReferenceError from "../../domain/errors/missing_reference.error"
import RecordConflictError from "../../domain/errors/record_conflict.error"
import SignInDelayedError from "../../domain/errors/sign_in_delayed.error"
import { isDatabaseUnavailable } from "../persistence/database_unavailable"
import type { DelayedResponse, ErrorResponse } from "../../types/error_response.type"
import { REQUEST_ID_HEADER } from "./request_id_middleware"

const NO_REQUEST_ID = "-"

const logger = new Logger("UnhandledException")

@Catch()
class UnhandledExceptionFilter implements ExceptionFilter {
  catch(thrown: unknown, host: ArgumentsHost): void {
    const exception = refusalOf(thrown)
    const context = host.switchToHttp()
    const request = context.getRequest<FastifyRequest>()
    const reply = context.getResponse<FastifyReply>()
    const requestId = requestIdOf(request)
    const traceId = requestId ?? NO_REQUEST_ID

    if (isDatabaseUnavailable(exception)) {
      logger.error(
        {
          message: `${request.method} ${request.url} could not reach the database`,
          requestId,
          fields: { method: request.method, path: request.url }
        },
        exception instanceof Error ? exception.stack : String(exception)
      )

      const unavailable: ErrorResponse = {
        error: "DATABASE_UNAVAILABLE",
        message:
          "identity could not reach its database, so it cannot say what this request would have " +
          "done. Retry later.",
        traceId
      }

      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send(unavailable)
      return
    }

    if (exception instanceof SignInDelayedError) {
      logger.warn({
        message: `${request.method} ${request.url} delayed for ${exception.retryAfterSeconds} s`,
        requestId,
        fields: { method: request.method, path: request.url, status: HttpStatus.TOO_MANY_REQUESTS }
      })

      const delayed: DelayedResponse = {
        error: "SIGN_IN_DELAYED",
        message:
          "Too many unsuccessful sign-in attempts for this account. Nothing was checked; try again " +
          "after the number of seconds in Retry-After.",
        retryAfterSeconds: exception.retryAfterSeconds,
        traceId
      }

      reply
        .status(HttpStatus.TOO_MANY_REQUESTS)
        .header("Retry-After", String(exception.retryAfterSeconds))
        .send(delayed)
      return
    }

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
        "something went wrong handling this request, and it is not known how much of it took " +
        "effect. Read the current state before retrying.",
      traceId
    }

    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(response)
  }
}

function refusalOf(thrown: unknown): unknown {
  if (thrown instanceof RecordConflictError) {
    return new ConflictException(thrown.message)
  }

  if (thrown instanceof MissingReferenceError) {
    return new NotFoundException(thrown.message)
  }

  return thrown
}

function requestIdOf(request: FastifyRequest): string | null {
  const header = request.headers[REQUEST_ID_HEADER]
  const value = Array.isArray(header) ? header[0] : header
  return value !== undefined && value.length > 0 ? value : null
}

export { UnhandledExceptionFilter }
