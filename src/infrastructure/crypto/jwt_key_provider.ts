import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createHash, createPrivateKey, createPublicKey, KeyObject } from "crypto"
import type { JsonWebKey, JwksDocument } from "../../types/jwks.type"

const PUBLIC_KEY_BLOCK = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g

@Injectable()
class JwtKeyProvider {
  private readonly privateKeyObject: KeyObject
  private readonly publicKeyObject: KeyObject
  private readonly keyId: string
  private readonly previousKeys: Map<string, KeyObject>

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
    this.previousKeys = JwtKeyProvider.previous(
      this.config.get<string>("KINETIX_IDENTITY_JWT_PREVIOUS_PUBLIC_KEYS_B64") ??
        process.env.KINETIX_IDENTITY_JWT_PREVIOUS_PUBLIC_KEYS_B64,
      this.keyId
    )
  }

  private static previous(encoded: string | undefined, currentKeyId: string): Map<string, KeyObject> {
    const keys = new Map<string, KeyObject>()
    if (!encoded || encoded.trim().length === 0) {
      return keys
    }

    const pem: string = Buffer.from(encoded.trim(), "base64").toString("utf8")
    const blocks: string[] = pem.match(PUBLIC_KEY_BLOCK) ?? []
    if (blocks.length === 0) {
      throw new Error(
        "KINETIX_IDENTITY_JWT_PREVIOUS_PUBLIC_KEYS_B64 holds no PEM public key. " +
          "It is the base64 of one or more PEM public keys, one after another."
      )
    }

    for (const block of blocks) {
      let key: KeyObject
      try {
        key = createPublicKey(block)
      } catch (cause) {
        throw new Error(`A previous signing key is not a usable public key: ${String(cause)}`)
      }

      const bits: number = key.asymmetricKeyDetails?.modulusLength ?? 0
      if (key.asymmetricKeyType !== "rsa" || bits < 2048) {
        throw new Error("A previous signing key must be RSA of at least 2048 bits.")
      }

      const keyId: string = JwtKeyProvider.thumbprint(key)
      if (keyId === currentKeyId) {
        throw new Error("A previous signing key is the current one; list only keys that signed before it.")
      }

      keys.set(keyId, key)
    }

    return keys
  }

  private static thumbprint(publicKey: KeyObject): string {
    const jwk = publicKey.export({ format: "jwk" }) as { e: string; kty: string; n: string }
    const canonical: string = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })
    return createHash("sha256").update(canonical).digest("base64url")
  }

  get privateKey(): KeyObject {
    return this.privateKeyObject
  }

  get kid(): string {
    return this.keyId
  }

  verificationKey(keyId: string | undefined): KeyObject | undefined {
    if (keyId === undefined) {
      return undefined
    }

    if (keyId === this.keyId) {
      return this.publicKeyObject
    }

    return this.previousKeys.get(keyId)
  }

  jwks(): JwksDocument {
    const published: Array<[string, KeyObject]> = [[this.keyId, this.publicKeyObject], ...this.previousKeys]

    return {
      keys: published.map(([keyId, key]) => ({
        ...(key.export({ format: "jwk" }) as JsonWebKey),
        kid: keyId,
        use: "sig",
        alg: "RS256"
      }))
    }
  }
}

export default JwtKeyProvider
