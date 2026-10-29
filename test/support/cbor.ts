import type { CborValue } from "../types/cbor_value.type"

const UNSIGNED = 0
const NEGATIVE = 1
const BYTES = 2
const TEXT = 3
const ARRAY = 4
const MAP = 5

function headOf(major: number, length: number): Buffer {
  if (length < 24) {
    return Buffer.from([(major << 5) | length])
  }

  if (length < 0x100) {
    return Buffer.from([(major << 5) | 24, length])
  }

  if (length < 0x10000) {
    const head = Buffer.alloc(3)
    head[0] = (major << 5) | 25
    head.writeUInt16BE(length, 1)

    return head
  }

  const head = Buffer.alloc(5)
  head[0] = (major << 5) | 26
  head.writeUInt32BE(length, 1)

  return head
}

function encodeCbor(value: CborValue): Buffer {
  if (typeof value === "number") {
    return value >= 0 ? headOf(UNSIGNED, value) : headOf(NEGATIVE, -1 - value)
  }

  if (typeof value === "string") {
    const text = Buffer.from(value, "utf8")

    return Buffer.concat([headOf(TEXT, text.length), text])
  }

  if (value instanceof Uint8Array) {
    return Buffer.concat([headOf(BYTES, value.length), value])
  }

  if (Array.isArray(value)) {
    return Buffer.concat([headOf(ARRAY, value.length), ...value.map(encodeCbor)])
  }

  const entries = [...value.entries()]

  return Buffer.concat([
    headOf(MAP, entries.length),
    ...entries.flatMap(function ([key, item]: [number | string, CborValue]): Buffer[] {
      return [encodeCbor(key), encodeCbor(item)]
    })
  ])
}

export { encodeCbor }
