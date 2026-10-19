type Ask = {
  updatedThrough: Date | null
  lastId: number
  limit: number
}

type AfterAsk = {
  transactionId: string
  lastId: number
  limit: number
}

type AliasRow = {
  principalId: string
  service: string
  localId: string
}

export type { AfterAsk, AliasRow, Ask }
