import { uniqueViolation } from "./sql_errors"

function fakeTokenRepository<T extends Record<string, any>>() {
  const rows: T[] = []
  const repository = {
    rows,
    create: (data: T) => ({ ...data }) as T,
    save: jest.fn(async (row: T) => {
      const existing = rows.find((r) => r.jti === row.jti)
      if (existing) {
        Object.assign(existing, row)
        return existing
      }
      rows.push(row)
      return row
    }),
    insert: jest.fn(async (row: T) => {
      if (rows.some((r) => r.jti === row.jti)) {
        throw uniqueViolation()
      }
      rows.push({ ...row })
      return { identifiers: [], generatedMaps: [], raw: [] }
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, any> }) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null
    }),
    update: jest.fn(async (where: Record<string, any>, patch: Record<string, any>) => {
      let affected = 0
      for (const row of rows) {
        const matches = Object.entries(where).every(([k, v]) => {
          if (v && typeof v === "object" && typeof v.type === "string") {
            if (v.type === "isNull") {
              return row[k] === null || row[k] === undefined
            }
            if (v.type === "not") {
              return row[k] !== v.value
            }
            return true
          }
          return row[k] === v
        })
        if (matches) {
          Object.assign(row, patch)
          affected += 1
        }
      }
      return { affected }
    }),
    delete: jest.fn(async () => ({ affected: 0 })),
    manager: {
      transaction: async <R>(work: (manager: { getRepository: () => unknown }) => Promise<R>): Promise<R> =>
        work({ getRepository: () => repository })
    }
  }
  return repository
}

export { fakeTokenRepository }
