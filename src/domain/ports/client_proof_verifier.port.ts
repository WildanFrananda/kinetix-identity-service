import type { ProofVerdict } from "../../types/client_proof.type"

interface ClientProofVerifierPort {
  verify(proof: string, appIds: ReadonlySet<string>): Promise<ProofVerdict>
}

export default ClientProofVerifierPort
