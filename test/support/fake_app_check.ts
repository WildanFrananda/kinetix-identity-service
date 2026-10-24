import { generateKeyPairSync, randomBytes } from "crypto"
import { createServer } from "http"
import type { IncomingMessage, Server, ServerResponse } from "http"
import type { AddressInfo } from "net"
import * as jwt from "jsonwebtoken"
import type { KeySetAnswer, ProofOptions, SigningKey } from "../types/fake_app_check.type"

const PROJECT_NUMBER = "123456789012"

const PROJECT_ID = "kinetix-test"

const ANDROID_APP_ID = `1:${PROJECT_NUMBER}:android:0a1b2c3d4e5f6a7b`

const IOS_APP_ID = `1:${PROJECT_NUMBER}:ios:7b6a5f4e3d2c1b0a`

const KEY_SET_PATH = "/v1/jwks"

function newSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const kid = randomBytes(8).toString("hex")

  return { kid, privateKey, publicJwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } }
}

class FakeAppCheck {
  readonly projectNumber = PROJECT_NUMBER
  readonly androidAppId = ANDROID_APP_ID
  readonly iosAppId = IOS_APP_ID
  requests = 0
  private keys: SigningKey[] = [newSigningKey()]
  private answer: KeySetAnswer = { kind: "keys" }
  private held: Promise<void> | null = null

  private constructor(
    private readonly server: Server,
    readonly url: string
  ) {}

  static async start(): Promise<FakeAppCheck> {
    const pending: FakeAppCheck[] = []
    const server = createServer(function (request: IncomingMessage, response: ServerResponse) {
      void pending[0].serve(request, response)
    })

    await new Promise<void>(function (resolve) {
      server.listen(0, "127.0.0.1", resolve)
    })

    const port = (server.address() as AddressInfo).port
    const fake = new FakeAppCheck(server, `http://127.0.0.1:${port}${KEY_SET_PATH}`)
    pending.push(fake)

    return fake
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections()

    await new Promise<void>((resolve) => {
      this.server.close(() => resolve())
    })
  }

  get signingKid(): string {
    return this.keys[this.keys.length - 1].kid
  }

  answerWith(answer: KeySetAnswer): void {
    this.answer = answer
  }

  rotate(): void {
    this.keys = [...this.keys, newSigningKey()]
  }

  retireAllButNewest(): void {
    this.keys = [this.keys[this.keys.length - 1]]
  }

  hold(): () => void {
    const fake = this
    let release: () => void = function () {}

    this.held = new Promise<void>(function (resolve) {
      release = resolve
    })

    return function () {
      fake.held = null
      release()
    }
  }

  proof(clockMs: number, options: ProofOptions = {}): string {
    const now = Math.floor(clockMs / 1000)
    const claims: Record<string, unknown> = {
      iss: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
      sub: ANDROID_APP_ID,
      aud: [`projects/${PROJECT_NUMBER}`, `projects/${PROJECT_ID}`],
      iat: now,
      exp: now + 3600,
      ...(options.claims ?? {})
    }
    for (const name of options.omit ?? []) {
      delete claims[name]
    }

    const signer = this.keys[this.keys.length - 1]
    const kid = options.kid === undefined ? signer.kid : options.kid
    const header = { typ: "JWT", ...(kid === null ? {} : { kid }), ...(options.header ?? {}) }

    return jwt.sign(claims, options.key ?? signer.privateKey, {
      algorithm: options.algorithm ?? "RS256",
      noTimestamp: (options.omit ?? []).includes("iat"),
      header: header as jwt.JwtHeader
    })
  }

  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.requests += 1

    if (this.held !== null) {
      await this.held
    }

    if (request.url !== KEY_SET_PATH) {
      response.writeHead(404).end()
      return
    }

    if (this.answer.kind === "drop") {
      request.socket.destroy()
      return
    }

    if (this.answer.kind === "status") {
      response.writeHead(this.answer.status, { "content-type": this.answer.contentType }).end(this.answer.body)
      return
    }

    const document = { keys: this.keys.map((key) => key.publicJwk) }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(document))
  }
}

export default FakeAppCheck
