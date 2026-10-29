import { createHash, generateKeyPairSync, randomBytes, sign } from "crypto"
import type { KeyObject } from "crypto"
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server"
import { encodeCbor } from "./cbor"
import type { CborValue } from "../types/cbor_value.type"
import type { SoftwareAuthenticatorSettings } from "../types/software_authenticator_settings.type"

const USER_PRESENT = 0x01

const USER_VERIFIED = 0x04

const BACKUP_ELIGIBLE = 0x08

const BACKED_UP = 0x10

const ATTESTED_CREDENTIAL = 0x40

const NO_AAGUID = Buffer.alloc(16)

const COSE_KEY_TYPE = 1

const COSE_ALGORITHM = 3

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest()
}

function clientDataOf(type: string, challenge: string, origin: string): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
}

class SoftwareAuthenticator {
  readonly credentialId: Buffer
  readonly algorithm: "ES256" | "RS256"
  counter = 0
  private readonly privateKey: KeyObject
  private readonly publicKey: KeyObject
  private readonly verifiesUser: boolean
  private readonly backedUp: boolean
  private readonly counterStep: number

  constructor(settings: SoftwareAuthenticatorSettings = {}) {
    this.algorithm = settings.algorithm ?? "ES256"
    this.credentialId = settings.credentialId ?? randomBytes(32)
    this.verifiesUser = settings.verifiesUser ?? true
    this.backedUp = settings.backedUp ?? false
    this.counterStep = settings.counterStep ?? 1

    const pair =
      settings.keys ??
      (this.algorithm === "ES256"
        ? generateKeyPairSync("ec", { namedCurve: "P-256" })
        : generateKeyPairSync("rsa", { modulusLength: 2048 }))

    this.privateKey = pair.privateKey
    this.publicKey = pair.publicKey
  }

  get id(): string {
    return this.credentialId.toString("base64url")
  }

  impostor(): SoftwareAuthenticator {
    return new SoftwareAuthenticator({ algorithm: this.algorithm, credentialId: this.credentialId })
  }

  withoutUserVerification(): SoftwareAuthenticator {
    const twin = new SoftwareAuthenticator({
      algorithm: this.algorithm,
      credentialId: this.credentialId,
      keys: { privateKey: this.privateKey, publicKey: this.publicKey },
      verifiesUser: false
    })

    twin.counter = this.counter

    return twin
  }

  register(options: PublicKeyCredentialCreationOptionsJSON, origin: string): RegistrationResponseJSON {
    const clientData = clientDataOf("webauthn.create", options.challenge, origin)
    const credentialIdLength = Buffer.alloc(2)
    credentialIdLength.writeUInt16BE(this.credentialId.length)

    const authenticatorData = Buffer.concat([
      this.authenticatorDataHead(options.rp.id ?? "", ATTESTED_CREDENTIAL),
      NO_AAGUID,
      credentialIdLength,
      this.credentialId,
      encodeCbor(this.coseKey())
    ])

    const attestationObject = encodeCbor(
      new Map<string, CborValue>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authenticatorData]
      ])
    )

    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: clientData.toString("base64url"),
        attestationObject: attestationObject.toString("base64url"),
        transports: ["internal"]
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform"
    }
  }

  assert(options: PublicKeyCredentialRequestOptionsJSON, origin: string): AuthenticationResponseJSON {
    this.counter += this.counterStep

    const clientData = clientDataOf("webauthn.get", options.challenge, origin)
    const authenticatorData = this.authenticatorDataHead(options.rpId ?? "", 0)
    const signature = sign("sha256", Buffer.concat([authenticatorData, sha256(clientData)]), this.privateKey)

    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url")
      },
      clientExtensionResults: {}
    }
  }

  private authenticatorDataHead(rpId: string, extraFlags: number): Buffer {
    const verified = this.verifiesUser ? USER_VERIFIED : 0
    const backup = this.backedUp ? BACKUP_ELIGIBLE | BACKED_UP : 0
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(this.counter)

    return Buffer.concat([sha256(Buffer.from(rpId)), Buffer.from([USER_PRESENT | verified | backup | extraFlags]), counter])
  }

  private coseKey(): Map<number, CborValue> {
    const jwk = this.publicKey.export({ format: "jwk" })

    if (this.algorithm === "ES256") {
      return new Map<number, CborValue>([
        [COSE_KEY_TYPE, 2],
        [COSE_ALGORITHM, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x ?? "", "base64url")],
        [-3, Buffer.from(jwk.y ?? "", "base64url")]
      ])
    }

    return new Map<number, CborValue>([
      [COSE_KEY_TYPE, 3],
      [COSE_ALGORITHM, -257],
      [-1, Buffer.from(jwk.n ?? "", "base64url")],
      [-2, Buffer.from(jwk.e ?? "", "base64url")]
    ])
  }
}

export default SoftwareAuthenticator
