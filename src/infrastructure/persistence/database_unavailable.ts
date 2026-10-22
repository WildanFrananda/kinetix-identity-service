import { QueryFailedError } from "typeorm"

const UNREACHABLE_SOCKET_CODES: ReadonlyArray<string> = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE"
]

const UNAVAILABLE_SQL_STATES: ReadonlyArray<string> = ["53300", "57P01", "57P02", "57P03"]

const CONNECTION_EXCEPTION_CLASS = "08"

const UNAVAILABLE_MESSAGES: ReadonlyArray<RegExp> = [
  /^Connection terminated/u,
  /timeout exceeded when trying to connect/u
]

function codeOf(error: Error): string | null {
  return "code" in error && typeof error.code === "string" ? error.code : null
}

function isUnavailableCause(cause: Error): boolean {
  if (cause instanceof AggregateError) {
    return cause.errors.some((inner: unknown) => inner instanceof Error && isUnavailableCause(inner))
  }

  const code = codeOf(cause)
  if (code !== null) {
    if (UNREACHABLE_SOCKET_CODES.includes(code) || UNAVAILABLE_SQL_STATES.includes(code)) {
      return true
    }
    if (code.length === 5 && code.startsWith(CONNECTION_EXCEPTION_CLASS)) {
      return true
    }
  }

  return UNAVAILABLE_MESSAGES.some((pattern) => pattern.test(cause.message))
}

function isDatabaseUnavailable(error: unknown): boolean {
  const cause: unknown = error instanceof QueryFailedError ? error.driverError : error

  return cause instanceof Error && isUnavailableCause(cause)
}

export { isDatabaseUnavailable }
