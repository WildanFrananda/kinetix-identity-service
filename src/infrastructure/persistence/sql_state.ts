import { QueryFailedError } from "typeorm"

const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"

function sqlStateOf(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) {
    return null
  }

  const driverError: unknown = error.driverError
  if (typeof driverError !== "object" || driverError === null || !("code" in driverError)) {
    return null
  }

  return typeof driverError.code === "string" ? driverError.code : null
}

function isUniqueViolation(error: unknown): boolean {
  return sqlStateOf(error) === UNIQUE_VIOLATION
}

function isForeignKeyViolation(error: unknown): boolean {
  return sqlStateOf(error) === FOREIGN_KEY_VIOLATION
}

export { isForeignKeyViolation, isUniqueViolation }
