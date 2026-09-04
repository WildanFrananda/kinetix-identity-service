import { base32Decode, base32Encode, codeAt, generateSecret, otpauthUrl, verifyCode } from "../src/infrastructure/crypto/totp"

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"))

describe("base32", () => {
  it("round-trips", () => {
    const bytes = Buffer.from("12345678901234567890", "ascii")
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
  })

  it("matches the known encoding of the RFC 6238 secret", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
  })

  it("refuses input that is not base32", () => {
    expect(() => base32Decode("not-base32!")).toThrow(/valid base32/)
  })
})

describe("TOTP against the RFC 6238 vectors", () => {
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"]
  ]

  for (const [seconds, expected] of vectors) {
    it(`T=${seconds} produces ${expected}`, () => {
      expect(codeAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected)
    })
  }
})

describe("verifyCode", () => {
  const at = (seconds: number) => seconds * 1000

  it("accepts the code for the current step", () => {
    expect(verifyCode(RFC_SECRET, "050471", at(1111111111))).toBe(true)
  })

  it("accepts the previous step's code", () => {
    const previous = codeAt(RFC_SECRET, Math.floor(1111111111 / 30) - 1)
    expect(verifyCode(RFC_SECRET, previous, at(1111111111))).toBe(true)
  })

  it("accepts the next step's code, for a clock that is slightly ahead", () => {
    const next = codeAt(RFC_SECRET, Math.floor(1111111111 / 30) + 1)
    expect(verifyCode(RFC_SECRET, next, at(1111111111))).toBe(true)
  })

  it("refuses a code two steps old", () => {
    const stale = codeAt(RFC_SECRET, Math.floor(1111111111 / 30) - 2)
    expect(verifyCode(RFC_SECRET, stale, at(1111111111))).toBe(false)
  })

  it("refuses a wrong code", () => {
    expect(verifyCode(RFC_SECRET, "000000", at(1111111111))).toBe(false)
  })

  it("refuses anything that is not six digits", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 456", "  ", "05047a"]) {
      expect(verifyCode(RFC_SECRET, bad, at(1111111111))).toBe(false)
    }
  })

  it("tolerates surrounding whitespace, which is what a paste produces", () => {
    expect(verifyCode(RFC_SECRET, "  050471  ", at(1111111111))).toBe(true)
  })
})

describe("secrets", () => {
  it("generates unpredictable base32 secrets", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      const secret = generateSecret()
      expect(secret).toMatch(/^[A-Z2-7]+$/)
      expect(secret.length).toBeGreaterThanOrEqual(32)
      seen.add(secret)
    }
    expect(seen.size).toBe(50)
  })

  it("builds an otpauth URL an authenticator can read", () => {
    const url = otpauthUrl("user@kinetix.test", RFC_SECRET)
    expect(url).toContain(`secret=${RFC_SECRET}`)
    expect(url).toContain("algorithm=SHA1")
    expect(url).toContain("digits=6")
    expect(url).toContain("period=30")
    expect(url).toContain("otpauth://totp/Kinetix%3Auser%40kinetix.test?")
  })
})
