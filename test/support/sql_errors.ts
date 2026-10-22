import { QueryFailedError } from "typeorm"

function sqlError(code: string, message: string): QueryFailedError {
  return new QueryFailedError("-- test", [], Object.assign(new Error(message), { code }))
}

function uniqueViolation(): QueryFailedError {
  return sqlError("23505", "duplicate key value violates unique constraint")
}

function foreignKeyViolation(): QueryFailedError {
  return sqlError("23503", "insert or update violates foreign key constraint")
}

export { foreignKeyViolation, uniqueViolation }
