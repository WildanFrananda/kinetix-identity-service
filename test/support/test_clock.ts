import type { EpochClock } from "../../src/types/client_proof.type"

class TestClock {
  private nowMs: number = Date.now()

  get now(): number {
    return this.nowMs
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds
  }

  reading(): EpochClock {
    const clock = this

    return function (): number {
      return clock.nowMs
    }
  }
}

export default TestClock
