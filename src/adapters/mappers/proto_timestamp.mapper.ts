import type { ProtoTimestamp, ProtoTimestampInput } from "../../types/identity_grpc.type"

function toProtoTimestamp(at: Date): ProtoTimestamp {
  const milliseconds = at.getTime()
  const seconds = Math.floor(milliseconds / 1000)

  return { seconds, nanos: (milliseconds - seconds * 1000) * 1_000_000 }
}

function fromProtoTimestamp(value: ProtoTimestampInput | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const raw = value.seconds

  if (raw === undefined || raw === null) {
    return null
  }

  const seconds = Number(String(raw))

  if (!Number.isFinite(seconds)) {
    return null
  }

  const nanos = typeof value.nanos === "number" ? value.nanos : 0

  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000))
}

export { fromProtoTimestamp, toProtoTimestamp }
