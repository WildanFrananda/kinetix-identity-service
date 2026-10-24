import { createHash } from "crypto"
import { normalisedEmail } from "../../domain/email_address"

function accountKeyOf(email: string): string {
  return createHash("sha256").update(normalisedEmail(email), "utf8").digest("hex")
}

export { accountKeyOf }
