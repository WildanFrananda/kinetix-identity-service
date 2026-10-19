import type { ProtoTransactionIdInput } from "../../types/identity_grpc.type"

const DECIMAL = /^\d{1,20}$/

function fromProtoTransactionId(value: ProtoTransactionIdInput | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const text = String(value)

  if (!DECIMAL.test(text) || BigInt(text) > 18446744073709551615n) {
    throw new Error(`transaction_id ${text} is not an unsigned 64-bit integer`)
  }

  return BigInt(text).toString()
}

export { fromProtoTransactionId }
