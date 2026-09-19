import { Injectable, Logger } from "@nestjs/common"
import { loadPackageDefinition, Client, Metadata, status } from "@grpc/grpc-js"
import { loadSync } from "@grpc/proto-loader"
import type { ServiceError } from "@grpc/grpc-js"
import FleetRegistryPort from "../../domain/ports/fleet_registry.port"
import FleetRegistryError from "../../domain/errors/fleet_registry.error"
import type {
  FleetActivation,
  FleetFailure,
  FleetRegistration,
  RegisterDriverCommand
} from "../../types/fleet.type"
import { contractProto, contractProtoRoot } from "./contract_proto"
import { loadServiceIdentity, meshClientCredentials } from "./service_identity"

const CALL_TIMEOUT_MS = 8_000

type RegisterReply = {
  success: boolean
  driver_id: string | number
  already_registered: boolean
  error?: { error_code?: string; message?: string }
}

type ActivateReply = {
  success: boolean
  driver_id: string | number
  already_active: boolean
  error?: { error_code?: string; message?: string }
}

@Injectable()
class FleetRegistryGrpcAdapter implements FleetRegistryPort {
  private readonly logger = new Logger(FleetRegistryGrpcAdapter.name)
  private client: Client | null = null

  async registerDriver(command: RegisterDriverCommand): Promise<FleetRegistration> {
    const reply = await this.call<RegisterReply>("RegisterDriver", {
      principal_id: command.principalId,
      vehicle_plate: command.vehiclePlate,
      capacity_kg: command.capacityKg
    })

    if (!reply.success) {
      throw new FleetRegistryError(this.refusal(reply.error))
    }

    return {
      driverId: Number(reply.driver_id),
      alreadyRegistered: Boolean(reply.already_registered)
    }
  }

  async activateDriver(principalId: string): Promise<FleetActivation> {
    const reply = await this.call<ActivateReply>("ActivateDriver", {
      principal_id: principalId
    })

    if (!reply.success) {
      throw new FleetRegistryError(this.refusal(reply.error))
    }

    return {
      driverId: Number(reply.driver_id),
      alreadyActive: Boolean(reply.already_active)
    }
  }

  private refusal(error?: { error_code?: string; message?: string }): FleetFailure {
    return {
      kind: "refused",
      code: error?.error_code ?? "FLEET_REFUSED",
      message: error?.message ?? "the fleet refused the request and gave no reason"
    }
  }

  private call<T>(method: string, request: Record<string, unknown>): Promise<T> {
    const client = this.connect()
    const deadline = new Date(Date.now() + CALL_TIMEOUT_MS)

    return new Promise<T>((resolve, reject) => {
      const invoke = (client as unknown as Record<string, unknown>)[
        method.charAt(0).toLowerCase() + method.slice(1)
      ]

      if (typeof invoke !== "function") {
        reject(
          new FleetRegistryError({
            kind: "refused",
            code: "FLEET_METHOD_MISSING",
            message:
              `fleet.v1.FleetRegistryService has no ${method} in the installed kinetix-contracts. ` +
              "The package is older than this code; bump it rather than working around this."
          })
        )
        return
      }

      const callback = (error: ServiceError | null, reply: T): void => {
        if (error) {
          reject(new FleetRegistryError(this.transportFailure(method, error)))
          return
        }
        resolve(reply)
      }

      ;(invoke as (...args: unknown[]) => void).call(
        client,
        request,
        new Metadata(),
        { deadline },
        callback
      )
    })
  }

  private transportFailure(method: string, error: ServiceError): FleetFailure {
    const certainlyUntouched = [
      status.INVALID_ARGUMENT,
      status.PERMISSION_DENIED,
      status.UNAUTHENTICATED,
      status.UNIMPLEMENTED
    ]

    const kind = certainlyUntouched.includes(error.code) ? "refused" : "unknown"

    this.logger.error({
      message: `fleet ${method} failed`,
      grpc_code: error.code,
      grpc_details: error.details,
      compensation: kind === "refused" ? "safe to undo the account" : "must not undo the account"
    })

    return {
      kind,
      code: `FLEET_${status[error.code] ?? "UNKNOWN"}`,
      message: error.details || error.message
    }
  }

  private connect(): Client {
    if (this.client) {
      return this.client
    }

    const host = process.env.MATCHING_GRPC_HOST
    if (!host) {
      throw new FleetRegistryError({
        kind: "refused",
        code: "FLEET_NOT_CONFIGURED",
        message:
          "MATCHING_GRPC_HOST is unset, so no vehicle can be filed. Refused rather than guessed: " +
          "a guessed address registers couriers into silence."
      })
    }

    let definition
    try {
      definition = loadSync(contractProto("fleet/v1/registry.proto"), {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [contractProtoRoot()]
      })
    } catch (cause) {
      throw new FleetRegistryError({
        kind: "refused",
        code: "FLEET_CONTRACT_MISSING",
        message:
          "fleet/v1/registry.proto is not in the installed kinetix-contracts. Bump the package to a " +
          `version that publishes it rather than working around this (${String(cause)})`
      })
    }

    const loaded = loadPackageDefinition(definition) as unknown as {
      fleet: { v1: { FleetRegistryService: new (...args: unknown[]) => Client } }
    }

    const credentials = meshClientCredentials(loadServiceIdentity())
    this.client = new loaded.fleet.v1.FleetRegistryService(host, credentials)

    return this.client
  }
}

export default FleetRegistryGrpcAdapter
