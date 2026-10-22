import { FastifyAdapter } from "@nestjs/platform-fastify"
import { isGatewayHop } from "./gateway_hop"

function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: isGatewayHop })
}

export { createFastifyAdapter }
