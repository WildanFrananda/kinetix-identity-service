import type { ThrottlerOptions } from "@nestjs/throttler"

const DEFAULT_THROTTLE: ThrottlerOptions = {
  ttl: 60000,
  limit: 10
}

export { DEFAULT_THROTTLE }
