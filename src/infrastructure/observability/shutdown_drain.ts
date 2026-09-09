import { Logger } from "@nestjs/common"
import type { Server } from "@grpc/grpc-js"
import type { ShutdownDrainOptions } from "../../types/shutdown.type"

const DEFAULT_GRACE_SECONDS = 25

const SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"]

const logger = new Logger("Shutdown")

function graceSecondsFrom(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_GRACE_SECONDS
  }

  const seconds = Number(value.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `SHUTDOWN_GRACE_SECONDS is "${value}", which is not a positive number of seconds.`
    )
  }

  return seconds
}

function installShutdownDrain(options: ShutdownDrainOptions): void {
  let draining = false

  const drain = (signal: NodeJS.Signals): void => {
    if (draining) {
      logger.warn({
        message: `${signal} arrived while already draining; the first drain continues`,
        fields: { signal }
      })
      return
    }
    draining = true

    logger.log({
      message: `${signal} received: refusing new work and finishing what is in flight`,
      fields: { signal, grace_seconds: options.graceSeconds }
    })

    let finished = false

    const deadline = setTimeout((): void => {
      if (finished) {
        logger.warn({
          message: "the drain finished but something is still holding the process open; exiting",
          fields: { grace_seconds: options.graceSeconds }
        })
        exitAfterFlush(0)
        return
      }

      logger.error({
        message: "work was still in flight when the grace period ran out; cancelling it and exiting",
        fields: { grace_seconds: options.graceSeconds }
      })
      forceShutdown(options.grpcServer)
      exitAfterFlush(1)
    }, options.graceSeconds * 1000)
    deadline.unref()

    void completeDrain(options).then(
      (): void => {
        finished = true
        logger.log({
          message: "drain complete: every in-flight HTTP request and gRPC call finished"
        })
      },
      (error: unknown): void => {
        logger.error({
          message: "the drain itself failed; exiting rather than reporting a clean stop",
          fields: { reason: reasonOf(error) }
        })
        exitAfterFlush(1)
      }
    )
  }

  for (const signal of SIGNALS) {
    process.on(signal, drain)
  }
}

async function completeDrain(options: ShutdownDrainOptions): Promise<void> {
  await Promise.all([drainGrpc(options.grpcServer), closeHttp(options)])

  try {
    await options.app.close()
  } catch (error: unknown) {
    logger.warn({
      message: "the application did not tear down cleanly after the drain",
      fields: { reason: reasonOf(error) }
    })
  }
}

async function closeHttp(options: ShutdownDrainOptions): Promise<void> {
  await options.app.getHttpAdapter().close()
}

function drainGrpc(server: Server | null): Promise<void> {
  if (server === null) {
    logger.warn({
      message: "no gRPC server was captured at boot; only the HTTP surface is being drained"
    })
    return Promise.resolve()
  }

  return new Promise<void>((resolve): void => {
    server.tryShutdown((error?: Error): void => {
      if (error !== undefined) {
        logger.warn({
          message: "the gRPC server reported an error while draining",
          fields: { reason: error.message }
        })
      }
      resolve()
    })
  })
}

function forceShutdown(server: Server | null): void {
  if (server === null) {
    return
  }

  try {
    server.forceShutdown()
  } catch (error: unknown) {
    logger.warn({
      message: "the gRPC server could not be shut down by force",
      fields: { reason: reasonOf(error) }
    })
  }
}

function exitAfterFlush(code: number): void {
  process.stdout.write("", (): void => {
    process.exit(code)
  })
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { graceSecondsFrom, installShutdownDrain }
