import * as jwt from "jsonwebtoken"
import ClientProofVerifierPort from "../../domain/ports/client_proof_verifier.port"
import AppCheckKeySet from "./app_check_key_set"
import { APP_CHECK_ALGORITHM, APP_CHECK_ISSUER_PREFIX, APP_CHECK_TOKEN_TYPE } from "./app_check_protocol"
import type { EpochClock, InvalidProofReason, ProofVerdict } from "../../types/client_proof.type"

const CLOCK_LEEWAY_SECONDS = 60

class FirebaseAppCheckVerifier implements ClientProofVerifierPort {
  private readonly issuer: string
  private readonly audience: string

  constructor(
    projectNumber: string,
    private readonly keys: AppCheckKeySet,
    private readonly clock: EpochClock
  ) {
    this.issuer = `${APP_CHECK_ISSUER_PREFIX}${projectNumber}`
    this.audience = `projects/${projectNumber}`
  }

  async verify(proof: string, appIds: ReadonlySet<string>): Promise<ProofVerdict> {
    const header = jwt.decode(proof, { complete: true })?.header
    if (header?.alg !== APP_CHECK_ALGORITHM || header.typ !== APP_CHECK_TOKEN_TYPE || !header.kid) {
      return invalid("malformed")
    }

    const lookup = await this.keys.keyFor(header.kid)
    if (lookup.outcome === "unavailable") {
      return { outcome: "unavailable" }
    }

    if (lookup.outcome === "unknown") {
      return invalid("invalid_signature")
    }

    let claims: string | jwt.JwtPayload

    try {
      claims = jwt.verify(proof, lookup.key, {
        algorithms: [APP_CHECK_ALGORITHM],
        ignoreExpiration: true,
        ignoreNotBefore: true
      })
    } catch (cause) {
      if (cause instanceof jwt.JsonWebTokenError) {
        return invalid("invalid_signature")
      }
      throw cause
    }

    if (typeof claims === "string") {
      return invalid("malformed")
    }

    return this.judge(claims, appIds)
  }

  private judge(claims: jwt.JwtPayload, appIds: ReadonlySet<string>): ProofVerdict {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== this.issuer || !audiences.includes(this.audience)) {
      return invalid("wrong_project")
    }

    if (typeof claims.exp !== "number" || typeof claims.iat !== "number") {
      return invalid("malformed")
    }

    const now = Math.floor(this.clock() / 1000)
    if (claims.exp <= now) {
      return invalid("expired")
    }

    const notBefore = claims.nbf ?? claims.iat
    if (claims.iat > now + CLOCK_LEEWAY_SECONDS || notBefore > now + CLOCK_LEEWAY_SECONDS) {
      return invalid("not_yet_valid")
    }

    if (typeof claims.sub !== "string" || !appIds.has(claims.sub)) {
      return invalid("wrong_app_id")
    }

    return { outcome: "valid" }
  }
}

function invalid(reason: InvalidProofReason): ProofVerdict {
  return { outcome: "invalid", reason }
}

export default FirebaseAppCheckVerifier
