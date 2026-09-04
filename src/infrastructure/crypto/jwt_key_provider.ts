import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createHash, createPrivateKey, createPublicKey, KeyObject } from "crypto"
import type { JsonWebKey, JwksDocument } from "../../types/jwks.type"

@Injectable()
class JwtKeyProvider {
  private readonly privateKeyObject: KeyObject
  private readonly publicKeyObject: KeyObject
  private readonly keyId: string

  constructor(private readonly config: ConfigService) {
    const encoded: string | undefined =
      this.config.get<string>("KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64") ??
      process.env.KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64

    if (!encoded || encoded.trim().length === 0) {
      throw new Error(
        "KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64 is required and has no default. " +
          "It is a base64-encoded PKCS#8 RSA private key, held in the SOPS store."
      )
    }

    const pem: string = Buffer.from(encoded.trim(), "base64").toString("utf8")
    if (!pem.includes("PRIVATE KEY")) {
      throw new Error(
        "KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64 did not decode to a PEM private key. " +
          "It must be the whole PEM file, base64-encoded, not the PEM body."
      )
    }

    let parsed: KeyObject
    try {
      parsed = createPrivateKey(pem)
    } catch (cause) {
      throw new Error(`KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64 is not a usable private key: ${String(cause)}`)
    }

    if (parsed.asymmetricKeyType !== "rsa") {
      throw new Error(`The signing key must be RSA for RS256; this one is ${String(parsed.asymmetricKeyType)}.`)
    }

    const bits: number = parsed.asymmetricKeyDetails?.modulusLength ?? 0
    if (bits < 2048) {
      throw new Error(`The signing key is ${bits}-bit; RS256 requires at least 2048.`)
    }

    this.privateKeyObject = parsed
    this.publicKeyObject = createPublicKey(parsed)
    this.keyId = JwtKeyProvider.thumbprint(this.publicKeyObject)
  }

  private static thumbprint(publicKey: KeyObject): string {
    const jwk = publicKey.export({ format: "jwk" }) as { e: string; kty: string; n: string }
    const canonical: string = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })
    return createHash("sha256").update(canonical).digest("base64url")
  }

  get privateKey(): KeyObject {
    return this.privateKeyObject
  }

  get publicKey(): KeyObject {
    return this.publicKeyObject
  }

  get kid(): string {
    return this.keyId
  }

  jwks(): JwksDocument {
    const jwk = this.publicKeyObject.export({ format: "jwk" }) as JsonWebKey
    return {
      keys: [
        {
          ...jwk,
          kid: this.keyId,
          use: "sig",
          alg: "RS256"
        }
      ]
    }
  }
}

export default JwtKeyProvider
