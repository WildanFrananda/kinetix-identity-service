import type { INestApplication } from "@nestjs/common"
import type { Server } from "@grpc/grpc-js"

type ShutdownDrainOptions = {
  app: INestApplication
  grpcServer: Server | null
  graceSeconds: number
}

export type { ShutdownDrainOptions }
