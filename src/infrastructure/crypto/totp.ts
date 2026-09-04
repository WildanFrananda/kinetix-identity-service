import { createHmac, randomBytes, timingSafeEqual } from "crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

const DIGITS = 6
const PERIOD_SECONDS = 30

const WINDOW_STEPS = 1

function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/=+$/, "").replace(/\s/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error("the stored two-factor secret is not valid base32")
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(out)
}

function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

function codeAt(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buffer.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac("sha1", key).update(buffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0")
}

function verifyCode(secret: string, code: string, atMs: number = Date.now()): boolean {
  const candidate = code.trim()
  if (!/^\d{6}$/.test(candidate)) {
    return false
  }

  const step = Math.floor(atMs / 1000 / PERIOD_SECONDS)
  const expected = Buffer.from(candidate, "utf8")

  let matched = false
  for (let offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset += 1) {
    const actual = Buffer.from(codeAt(secret, step + offset), "utf8")
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      matched = true
    }
  }
  return matched
}

function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`Kinetix:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=Kinetix&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`
}

export { base32Decode, base32Encode, codeAt, generateSecret, otpauthUrl, verifyCode, DIGITS, PERIOD_SECONDS }
