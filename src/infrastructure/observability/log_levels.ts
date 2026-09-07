import type { LogLevel } from "@nestjs/common"

const LEVELS: Record<string, LogLevel[]> = {
  error: ["error", "fatal"],
  warn: ["warn", "error", "fatal"],
  warning: ["warn", "error", "fatal"],
  info: ["log", "warn", "error", "fatal"],
  log: ["log", "warn", "error", "fatal"],
  debug: ["debug", "log", "warn", "error", "fatal"],
  verbose: ["verbose", "debug", "log", "warn", "error", "fatal"],
  trace: ["verbose", "debug", "log", "warn", "error", "fatal"]
}

const DEFAULT: LogLevel[] = LEVELS.info

function logLevelsFrom(value: string | undefined): LogLevel[] {
  if (value === undefined || value.trim() === "") {
    return DEFAULT
  }

  const levels = LEVELS[value.trim().toLowerCase()]
  if (levels === undefined) {
    throw new Error(
      `LOG_LEVEL is "${value}", which is not a level. Use one of: ${Object.keys(LEVELS).join(", ")}.`
    )
  }

  return levels
}

export { logLevelsFrom }
