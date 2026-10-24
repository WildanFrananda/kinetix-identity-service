import { Logger } from "@nestjs/common"
import { createPublicKey } from "crypto"
import type { KeyObject } from "crypto"
import { APP_CHECK_ALGORITHM } from "./app_check_protocol"
import type { EpochClock, PublishedSigningKey, SigningKeyLookup } from "../../types/client_proof.type"

const KEYS_LIVE_MS = 6 * 60 * 60 * 1000

const REFETCH_INTERVAL_MS = 10 * 1000

const FETCH_TIMEOUT_MS = 5000

const SHORTEST_MODULUS_BITS = 2048

class AppCheckKeySet {
  private readonly logger = new Logger(AppCheckKeySet.name)
  private keys: ReadonlyMap<string, KeyObject> | null = null
  private fetchedAtMs = 0
  private lastAttemptAtMs: number | null = null
  private lastAttemptFailed = false
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly url: string,
    private readonly clock: EpochClock
  ) {}

  async keyFor(kid: string): Promise<SigningKeyLookup> {
    const cached = this.freshKeys()?.get(kid)
    if (cached !== undefined) {
      return { outcome: "found", key: cached }
    }

    await this.refetch()

    const keys = this.freshKeys()
    if (keys === null) {
      return { outcome: "unavailable" }
    }

    const key = keys.get(kid)
    if (key !== undefined) {
      return { outcome: "found", key }
    }

    return this.lastAttemptFailed ? { outcome: "unavailable" } : { outcome: "unknown" }
  }

  private freshKeys(): ReadonlyMap<string, KeyObject> | null {
    if (this.keys === null || this.clock() - this.fetchedAtMs >= KEYS_LIVE_MS) {
      return null
    }

    return this.keys
  }

  private async refetch(): Promise<void> {
    if (this.inFlight !== null) {
      await this.inFlight
      return
    }

    const now = this.clock()
    if (this.lastAttemptAtMs !== null && now - this.lastAttemptAtMs < REFETCH_INTERVAL_MS) {
      return
    }

    this.lastAttemptAtMs = now
    this.inFlight = this.fetchKeys().finally(() => {
      this.inFlight = null
    })

    await this.inFlight
  }

  private async fetchKeys(): Promise<void> {
    try {
      const keys = await this.download()

      this.keys = keys
      this.fetchedAtMs = this.clock()
      this.lastAttemptFailed = false
    } catch (cause) {
      this.lastAttemptFailed = true
      this.logger.error({
        message: "the App Check key set could not be read; client proofs cannot be checked until it can",
        fields: {
          event: "app_check_keys_unavailable",
          reason: cause instanceof Error ? cause.message : String(cause)
        }
      })
    }
  }

  private async download(): Promise<ReadonlyMap<string, KeyObject>> {
    const response = await fetch(this.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) {
      throw new Error(`the key set answered HTTP ${response.status}`)
    }

    return keysOf(await response.json())
  }
}

function keysOf(document: unknown): ReadonlyMap<string, KeyObject> {
  const entries = typeof document === "object" && document !== null ? (document as { keys?: unknown }).keys : null
  if (!Array.isArray(entries)) {
    throw new Error("the key set is not a JWKS document")
  }

  const keys = new Map<string, KeyObject>()

  for (const entry of entries) {
    const published = signingKeyOf(entry)
    if (published !== null) {
      keys.set(published.kid, published.key)
    }
  }

  if (keys.size === 0) {
    throw new Error(`the key set holds no ${APP_CHECK_ALGORITHM} signing key`)
  }

  return keys
}

function signingKeyOf(entry: unknown): PublishedSigningKey | null {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("the key set holds an entry that is not a key")
  }

  const jwk = entry as Record<string, unknown>
  const signs = jwk.use === undefined || jwk.use === "sig"
  const rs256 = jwk.alg === undefined || jwk.alg === APP_CHECK_ALGORITHM
  if (jwk.kty !== "RSA" || !signs || !rs256 || typeof jwk.kid !== "string" || jwk.kid.length === 0) {
    return null
  }

  if (typeof jwk.n !== "string" || typeof jwk.e !== "string") {
    throw new Error(`the key set's key ${jwk.kid} has no modulus or exponent`)
  }

  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" })
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < SHORTEST_MODULUS_BITS) {
    throw new Error(`the key set's key ${jwk.kid} is shorter than ${SHORTEST_MODULUS_BITS} bits`)
  }

  return { kid: jwk.kid, key }
}

export default AppCheckKeySet
