import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common"
import ClientProofVerifierPort from "../../domain/ports/client_proof_verifier.port"
import { declareClientRefusals, recordClientRefusal } from "../../infrastructure/observability/metrics_registry"
import type { CallContext } from "../../types/call_context.type"
import type {
  AttestedClient,
  ClientRefusalReason,
  ClientRefusalSeries,
  ClientRegistry,
  ProofRefusalReason,
  RequestClient
} from "../../types/client.type"

const CLIENT_HEADER = "x-kinetix-client"

const APP_CHECK_HEADER = "x-firebase-appcheck"

const UNNAMED = "unnamed"

const UNKNOWN = "unknown"

const LONGEST_LOGGED_NAME = 64

const PROOF_REFUSALS: readonly ProofRefusalReason[] = [
  "missing",
  "malformed",
  "invalid_signature",
  "expired",
  "not_yet_valid",
  "wrong_project",
  "wrong_app_id",
  "keys_unavailable"
]

@Injectable()
class ClientGateService {
  private readonly logger = new Logger(ClientGateService.name)

  constructor(
    private readonly registry: ClientRegistry,
    private readonly verifier: ClientProofVerifierPort | null
  ) {
    const attested = [...registry.clients.values()].some(function (client) {
      return client.proof === "app_check"
    })
    if (attested && verifier === null) {
      throw new Error("a client is configured with app_check, and no App Check verifier was given")
    }

    declareClientRefusals(this.refusalSeries())
  }

  async admit(
    headers: Record<string, string | string[] | undefined>,
    requestId: string | null
  ): Promise<RequestClient> {
    const presented = headers[CLIENT_HEADER]
    if (presented === undefined) {
      if (this.registry.unnamed === "refuse") {
        throw this.refuse(UNNAMED, "client_required", requestId, null)
      }

      return { kind: "unnamed" }
    }

    const client = typeof presented === "string" ? this.registry.clients.get(presented) : undefined
    if (client === undefined) {
      throw this.refuse(UNKNOWN, "unknown_client", requestId, String(presented))
    }

    if (client.proof === "none") {
      return { kind: "named", name: client.name }
    }

    await this.prove(client, headers[APP_CHECK_HEADER], requestId)

    return { kind: "named", name: client.name }
  }

  mismatch(sessionClient: string | null, request: RequestClient, context: CallContext, userId: number): HttpException {
    const client = request.kind === "named" ? request.name : UNNAMED

    recordClientRefusal(client, "client_mismatch")

    this.logger.warn({
      message: "client_proof_refused",
      requestId: context.requestId,
      fields: {
        event: "client_proof_refused",
        client,
        reason: "client_mismatch",
        session_client: sessionClient ?? UNNAMED,
        user_id: userId
      }
    })

    return refusalOf("client_mismatch")
  }

  bound(client: string, context: CallContext, userId: number): void {
    this.logger.log({
      message: "a session that named no client was bound to the client that renewed it",
      requestId: context.requestId,
      fields: { event: "client_session_bound", client, user_id: userId }
    })
  }

  private async prove(
    client: AttestedClient,
    header: string | string[] | undefined,
    requestId: string | null
  ): Promise<void> {
    const proof = typeof header === "string" ? header.trim() : ""
    if (proof.length === 0) {
      throw this.refuse(client.name, "missing", requestId, null)
    }

    if (this.verifier === null) {
      throw new Error(`client ${client.name} uses app_check, and no App Check verifier was given`)
    }

    const verdict = await this.verifier.verify(proof, client.appIds)
    if (verdict.outcome === "unavailable") {
      throw this.refuse(client.name, "keys_unavailable", requestId, null)
    }

    if (verdict.outcome === "invalid") {
      throw this.refuse(client.name, verdict.reason, requestId, null)
    }
  }

  private refuse(
    client: string,
    reason: ClientRefusalReason,
    requestId: string | null,
    presented: string | null
  ): HttpException {
    recordClientRefusal(client, reason)

    this.logger.warn({
      message: "client_proof_refused",
      requestId,
      fields: {
        event: "client_proof_refused",
        client,
        reason,
        ...(presented === null ? {} : { presented: presented.slice(0, LONGEST_LOGGED_NAME) })
      }
    })

    return refusalOf(reason)
  }

  private refusalSeries(): ClientRefusalSeries[] {
    const series: ClientRefusalSeries[] = [
      { client: UNKNOWN, reason: "unknown_client" },
      { client: UNNAMED, reason: "client_required" },
      { client: UNNAMED, reason: "client_mismatch" }
    ]

    for (const client of this.registry.clients.values()) {
      series.push({ client: client.name, reason: "client_mismatch" })

      if (client.proof === "app_check") {
        for (const reason of PROOF_REFUSALS) {
          series.push({ client: client.name, reason })
        }
      }
    }

    return series
  }
}

function refusalOf(reason: ClientRefusalReason): HttpException {
  switch (reason) {
    case "unknown_client":
      return new BadRequestException({
        error: "UNKNOWN_CLIENT",
        message: "X-Kinetix-Client names a client identity does not know."
      })
    case "client_required":
      return new BadRequestException({
        error: "CLIENT_REQUIRED",
        message: "This request must name its client in X-Kinetix-Client."
      })
    case "missing":
      return new UnauthorizedException({
        error: "CLIENT_PROOF_REQUIRED",
        message: "This client must prove it is genuine on every sign-in and renewal, and sent no proof."
      })
    case "keys_unavailable":
      return new ServiceUnavailableException({
        error: "CLIENT_PROOF_UNAVAILABLE",
        message: "identity could not check the client's proof right now, so it checked nothing. Try again later."
      })
    case "client_mismatch":
      return new UnauthorizedException({
        error: "CLIENT_MISMATCH",
        message:
          "This session was started by another client, so this one cannot renew it. Nothing was changed; " +
          "sign in again from this app."
      })
    case "malformed":
    case "invalid_signature":
    case "expired":
    case "not_yet_valid":
    case "wrong_project":
    case "wrong_app_id":
      return new UnauthorizedException({
        error: "CLIENT_PROOF_INVALID",
        message: "The client's proof was not accepted. Fetch a fresh one and try again."
      })
  }
}

export default ClientGateService
export { APP_CHECK_HEADER, CLIENT_HEADER }
