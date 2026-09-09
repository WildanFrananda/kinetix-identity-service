import type { LoggerService, LogLevel } from "@nestjs/common"
import type { LogEvent } from "../../types/log_event.type"

const SEVERITY: Readonly<Record<LogLevel, string>> = {
  verbose: "trace",
  debug: "debug",
  log: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal"
}

const RESERVED: ReadonlySet<string> = new Set([
  "timestamp",
  "level",
  "message",
  "logger",
  "request_id",
  "stack",
  "details"
])

const CARRIES_STACK: ReadonlySet<LogLevel> = new Set<LogLevel>(["error", "fatal"])

const UNNAMED_LOGGER = "application"

class JsonLogger implements LoggerService {
  private levels: Set<LogLevel>

  constructor(levels: readonly LogLevel[]) {
    this.levels = new Set(levels)
  }

  setLogLevels(levels: LogLevel[]): void {
    this.levels = new Set(levels)
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("log", message, optionalParams)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("warn", message, optionalParams)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("error", message, optionalParams)
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("fatal", message, optionalParams)
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("debug", message, optionalParams)
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit("verbose", message, optionalParams)
  }

  private emit(level: LogLevel, message: unknown, optionalParams: readonly unknown[]): void {
    if (!this.levels.has(level)) {
      return
    }

    const params = [...optionalParams]
    const last = params[params.length - 1]
    const context = typeof last === "string" ? String(params.pop()) : null

    const event = eventOf(message)
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: SEVERITY[level],
      message: event.message,
      logger: context ?? UNNAMED_LOGGER,
      request_id: event.requestId ?? null
    }

    for (const [key, value] of Object.entries(event.fields ?? {})) {
      record[RESERVED.has(key) ? `field_${key}` : key] = value
    }

    const remainder = remainderOf(params)
    if (remainder !== null) {
      record[CARRIES_STACK.has(level) ? "stack" : "details"] = remainder
    }

    process.stdout.write(lineOf(record))
  }
}

function eventOf(message: unknown): LogEvent {
  if (typeof message === "string") {
    return { message }
  }

  if (message instanceof Error) {
    return { message: message.message, fields: { error: message.name } }
  }

  if (isLogEvent(message)) {
    return message
  }

  return { message: textOf(message) }
}

function isLogEvent(value: unknown): value is LogEvent {
  if (typeof value !== "object" || value === null) {
    return false
  }
  return typeof (value as { message?: unknown }).message === "string"
}

function remainderOf(params: readonly unknown[]): string | null {
  const parts: string[] = []

  for (const param of params) {
    if (param instanceof Error) {
      parts.push(param.stack ?? `${param.name}: ${param.message}`)
    } else if (typeof param === "string" && param !== "") {
      parts.push(param)
    }
  }

  return parts.length === 0 ? null : parts.join("\n")
}

function textOf(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function lineOf(record: Record<string, unknown>): string {
  try {
    return `${JSON.stringify(record)}\n`
  } catch {
    const fallback = {
      timestamp: record.timestamp,
      level: record.level,
      message: "a log record could not be serialised as JSON",
      logger: record.logger,
      request_id: record.request_id ?? null
    }
    return `${JSON.stringify(fallback)}\n`
  }
}

export { JsonLogger }
