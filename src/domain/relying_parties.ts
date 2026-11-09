import type { RelyingParty } from "../types/relying_party.type"

class RelyingParties {
  readonly first: RelyingParty
  private readonly parties: readonly RelyingParty[]

  constructor(parties: readonly RelyingParty[]) {
    const first = parties[0]
    if (first === undefined) {
      throw new Error("passkeys need at least one relying party")
    }

    this.first = first
    this.parties = [...parties]
  }

  facing(origin: string | null): RelyingParty | null {
    if (origin === null) {
      return this.first
    }

    const party = this.parties.find(function (candidate: RelyingParty): boolean {
      return candidate.origin === origin
    })

    return party ?? null
  }
}

export default RelyingParties
