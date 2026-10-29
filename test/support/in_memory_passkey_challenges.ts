import { randomUUID } from "crypto"
import PasskeyChallengeRepositoryPort from "../../src/domain/ports/passkey_challenge_repository.port"
import type { InMemoryPasskeyChallenge } from "../types/in_memory_passkey_challenge.type"

class InMemoryPasskeyChallenges implements PasskeyChallengeRepositoryPort {
  readonly rows = new Map<string, InMemoryPasskeyChallenge>()
  private nowMs: number = Date.now()

  advance(seconds: number): void {
    this.nowMs += seconds * 1000
  }

  async issueRegistration(userId: number, challenge: string, lifetimeSeconds: number): Promise<string> {
    const id = randomUUID()
    const expiresAtMs = this.nowMs + lifetimeSeconds * 1000

    this.rows.set(id, { id, userId, purpose: "register", challenge, mfaJti: null, expiresAtMs, used: false })

    return id
  }

  async issueSignIn(userId: number, mfaJti: string, challenge: string, lifetimeSeconds: number): Promise<void> {
    const open = [...this.rows.values()].find((row) => row.mfaJti === mfaJti)
    const id = open?.id ?? randomUUID()
    const expiresAtMs = this.nowMs + lifetimeSeconds * 1000

    this.rows.set(id, { id, userId, purpose: "sign_in", challenge, mfaJti, expiresAtMs, used: false })
  }

  async spendRegistration(challengeId: string, userId: number): Promise<string | null> {
    return this.spend(this.rows.get(challengeId), "register", userId)
  }

  async spendSignIn(mfaJti: string, userId: number): Promise<string | null> {
    return this.spend(
      [...this.rows.values()].find((row) => row.mfaJti === mfaJti),
      "sign_in",
      userId
    )
  }

  async sweep(): Promise<number> {
    let swept = 0

    for (const row of [...this.rows.values()]) {
      if (row.expiresAtMs < this.nowMs) {
        this.rows.delete(row.id)
        swept += 1
      }
    }

    return swept
  }

  private spend(
    row: InMemoryPasskeyChallenge | undefined,
    purpose: InMemoryPasskeyChallenge["purpose"],
    userId: number
  ): string | null {
    if (row === undefined || row.purpose !== purpose || row.userId !== userId) {
      return null
    }

    if (row.used || row.expiresAtMs <= this.nowMs) {
      return null
    }

    row.used = true

    return row.challenge
  }
}

export default InMemoryPasskeyChallenges
