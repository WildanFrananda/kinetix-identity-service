type Ask = {
  updatedThrough: Date | null
  lastId: number
  limit: number
}

type AliasRow = {
  principalId: string
  service: string
  localId: string
}

export type { AliasRow, Ask }
