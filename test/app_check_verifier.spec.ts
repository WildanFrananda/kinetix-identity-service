import { generateKeyPairSync } from "crypto"
import AppCheckKeySet from "../src/infrastructure/attestation/app_check_key_set"
import { APP_CHECK_JWKS_URL } from "../src/infrastructure/attestation/app_check_protocol"
import FirebaseAppCheckVerifier from "../src/infrastructure/attestation/firebase_app_check_verifier"
import FakeAppCheck from "./support/fake_app_check"
import TestClock from "./support/test_clock"

const HOUR_MS = 60 * 60 * 1000

const SHORT_MODULUS = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey.export({ format: "jwk" }).n

describe("verifying a Firebase App Check token", () => {
  let fake: FakeAppCheck
  let clock: TestClock
  let verifier: FirebaseAppCheckVerifier
  let appIds: ReadonlySet<string>

  beforeEach(async () => {
    fake = await FakeAppCheck.start()
    clock = new TestClock()
    verifier = new FirebaseAppCheckVerifier(
      fake.projectNumber,
      new AppCheckKeySet(fake.url, clock.reading()),
      clock.reading()
    )
    appIds = new Set([fake.androidAppId, fake.iosAppId])
  })

  afterEach(async () => {
    await fake.stop()
  })

  it("verifies against Google's published key set, a constant of the protocol", () => {
    expect(APP_CHECK_JWKS_URL).toBe("https://firebaseappcheck.googleapis.com/v1/jwks")
  })

  it("accepts a genuine token from either allowed app", async () => {
    const android = fake.proof(clock.now)
    const ios = fake.proof(clock.now, { claims: { sub: fake.iosAppId } })

    expect(await verifier.verify(android, appIds)).toEqual({ outcome: "valid" })
    expect(await verifier.verify(ios, appIds)).toEqual({ outcome: "valid" })
  })

  describe("refuses", () => {
    it.each([
      ["RS512", { algorithm: "RS512" as const }],
      ["PS256", { algorithm: "PS256" as const }],
      ["a typ other than JWT", { header: { typ: "at+jwt" } }],
      ["no kid", { kid: null }]
    ])("a token with %s as malformed, before it fetches any key", async (_case, options) => {
      const verdict = await verifier.verify(fake.proof(clock.now, options), appIds)

      expect(verdict).toEqual({ outcome: "invalid", reason: "malformed" })
      expect(fake.requests).toBe(0)
    })

    it("an HS256 token whose secret is the public key's text", async () => {
      const forged = fake.proof(clock.now, { algorithm: "HS256", key: "the public key, guessed as a secret" })

      expect(await verifier.verify(forged, appIds)).toEqual({ outcome: "invalid", reason: "malformed" })
    })

    it("text that is not a token at all", async () => {
      expect(await verifier.verify("not-a-token", appIds)).toEqual({ outcome: "invalid", reason: "malformed" })
    })

    it("a token signed by another key under a published kid", async () => {
      const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
      const forged = fake.proof(clock.now, { key: stranger })

      expect(await verifier.verify(forged, appIds)).toEqual({ outcome: "invalid", reason: "invalid_signature" })
    })

    it("a token naming a kid the freshly fetched key set does not hold", async () => {
      const forged = fake.proof(clock.now, { kid: "0000000000000000" })

      expect(await verifier.verify(forged, appIds)).toEqual({ outcome: "invalid", reason: "invalid_signature" })
    })

    it("a token from another Firebase project, by issuer", async () => {
      const other = fake.proof(clock.now, { claims: { iss: "https://firebaseappcheck.googleapis.com/999999999999" } })

      expect(await verifier.verify(other, appIds)).toEqual({ outcome: "invalid", reason: "wrong_project" })
    })

    it("a token from another Firebase project, by audience", async () => {
      const other = fake.proof(clock.now, { claims: { aud: ["projects/999999999999", "projects/someone-else"] } })

      expect(await verifier.verify(other, appIds)).toEqual({ outcome: "invalid", reason: "wrong_project" })
    })

    it("an expired token, from the second it expires", async () => {
      const proof = fake.proof(clock.now)
      clock.advance(HOUR_MS)

      expect(await verifier.verify(proof, appIds)).toEqual({ outcome: "invalid", reason: "expired" })
    })

    it("a token issued more than a minute in the future", async () => {
      const early = fake.proof(clock.now + 2 * 60 * 1000)

      expect(await verifier.verify(early, appIds)).toEqual({ outcome: "invalid", reason: "not_yet_valid" })
    })

    it("a token not valid before a time more than a minute away", async () => {
      const early = fake.proof(clock.now, { claims: { nbf: Math.floor(clock.now / 1000) + 120 } })

      expect(await verifier.verify(early, appIds)).toEqual({ outcome: "invalid", reason: "not_yet_valid" })
    })

    it.each(["exp", "iat"])("a token without %s", async (claim) => {
      const proof = fake.proof(clock.now, { omit: [claim] })

      expect(await verifier.verify(proof, appIds)).toEqual({ outcome: "invalid", reason: "malformed" })
    })

    it("a genuine token of an app that is not allowed", async () => {
      const web = fake.proof(clock.now, { claims: { sub: `1:${fake.projectNumber}:web:00aa11bb22cc33dd` } })

      expect(await verifier.verify(web, appIds)).toEqual({ outcome: "invalid", reason: "wrong_app_id" })
    })

    it("a token without an app id", async () => {
      const proof = fake.proof(clock.now, { omit: ["sub"] })

      expect(await verifier.verify(proof, appIds)).toEqual({ outcome: "invalid", reason: "wrong_app_id" })
    })
  })

  it("takes a token issued a few seconds ahead of its own clock", async () => {
    const proof = fake.proof(clock.now + 30 * 1000)

    expect(await verifier.verify(proof, appIds)).toEqual({ outcome: "valid" })
  })

  describe("the key set", () => {
    it("is fetched once and reused for every token while it is fresh", async () => {
      for (let token = 0; token < 5; token++) {
        expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "valid" })
        clock.advance(HOUR_MS)
      }

      expect(fake.requests).toBe(1)
    })

    it("is fetched again after six hours, and its old keys are no longer trusted", async () => {
      await verifier.verify(fake.proof(clock.now), appIds)
      clock.advance(6 * HOUR_MS)
      fake.answerWith({ kind: "drop" })

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "unavailable" })
      expect(fake.requests).toBe(2)
    })

    it("learns a rotated key the first time a token names it", async () => {
      await verifier.verify(fake.proof(clock.now), appIds)
      fake.rotate()
      clock.advance(11 * 1000)

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "valid" })
      expect(fake.requests).toBe(2)
    })

    it("refetches for an unknown kid at most once every ten seconds", async () => {
      await verifier.verify(fake.proof(clock.now), appIds)
      const forged = fake.proof(clock.now, { kid: "0000000000000000" })

      for (let second = 0; second <= 20; second++) {
        expect(await verifier.verify(forged, appIds)).toEqual({ outcome: "invalid", reason: "invalid_signature" })
        clock.advance(1000)
      }

      expect(fake.requests).toBe(3)
    })

    it("has one fetch in flight however many tokens wait on it", async () => {
      const release = fake.hold()
      const verdicts = Promise.all(
        Array.from({ length: 10 }, () => verifier.verify(fake.proof(clock.now), appIds))
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
      release()

      expect(await verdicts).toEqual(Array.from({ length: 10 }, () => ({ outcome: "valid" })))
      expect(fake.requests).toBe(1)
    })

    it.each([
      ["refuses the connection", { kind: "drop" as const }],
      ["answers 500", { kind: "status" as const, status: 500, body: "{}", contentType: "application/json" }],
      ["answers HTML", { kind: "status" as const, status: 200, body: "<html></html>", contentType: "text/html" }],
      ["holds no key", { kind: "status" as const, status: 200, body: '{"keys":[]}', contentType: "application/json" }],
      [
        "is not a key set",
        { kind: "status" as const, status: 200, body: '{"kid":"x"}', contentType: "application/json" }
      ]
    ])("makes a token unverifiable, never invalid, when it %s", async (_case, answer) => {
      fake.answerWith(answer)

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "unavailable" })
    })

    it.each([
      ["no usable modulus", "%%%"],
      ["a modulus too short for RS256", SHORT_MODULUS]
    ])("makes a token unverifiable when the key it names has %s", async (_case, modulus) => {
      const key = { kty: "RSA", kid: fake.signingKid, alg: "RS256", use: "sig", n: modulus, e: "AQAB" }
      fake.answerWith({
        kind: "status",
        status: 200,
        body: JSON.stringify({ keys: [key] }),
        contentType: "application/json"
      })

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "unavailable" })
    })

    it("remembers a failed fetch for ten seconds, then asks again", async () => {
      fake.answerWith({ kind: "drop" })
      await verifier.verify(fake.proof(clock.now), appIds)

      for (let attempt = 0; attempt < 5; attempt++) {
        expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "unavailable" })
        clock.advance(1000)
      }
      expect(fake.requests).toBe(1)

      fake.answerWith({ kind: "keys" })
      clock.advance(6 * 1000)

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "valid" })
      expect(fake.requests).toBe(2)
    })

    it("does not call a token with a new kid invalid while the refetch for it failed", async () => {
      await verifier.verify(fake.proof(clock.now), appIds)
      fake.rotate()
      fake.answerWith({ kind: "drop" })
      clock.advance(11 * 1000)

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "unavailable" })
    })

    it("still verifies with the keys it holds while a refetch fails", async () => {
      const known = fake.proof(clock.now)
      await verifier.verify(known, appIds)
      fake.answerWith({ kind: "drop" })
      clock.advance(11 * 1000)

      await verifier.verify(fake.proof(clock.now, { kid: "0000000000000000" }), appIds)

      expect(await verifier.verify(fake.proof(clock.now), appIds)).toEqual({ outcome: "valid" })
    })
  })
})
