import type { FleetFailure } from "../../types/fleet.type"

class FleetRegistryError extends Error {
  readonly failure: FleetFailure

  constructor(failure: FleetFailure) {
    super(`${failure.code}: ${failure.message}`)
    this.name = "FleetRegistryError"
    this.failure = failure
  }

  get definitelyDidNothing(): boolean {
    return this.failure.kind !== "unknown"
  }

  get isFault(): boolean {
    return this.failure.kind === "fault"
  }
}

export default FleetRegistryError
