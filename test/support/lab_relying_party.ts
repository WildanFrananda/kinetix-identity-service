import RelyingParties from "../../src/domain/relying_parties"
import type { RelyingParty } from "../../src/types/relying_party.type"

const LAB_RELYING_PARTY: RelyingParty = {
  id: "backoffice.localhost",
  origin: "https://backoffice.localhost:8443",
  name: "Kinetix Backoffice"
}

const ONION_RELYING_PARTY: RelyingParty = {
  id: "kinetixbackofficeexampleonionaddressabcdefghijklmnopqrstu.onion",
  origin: "https://kinetixbackofficeexampleonionaddressabcdefghijklmnopqrstu.onion",
  name: "Kinetix Backoffice"
}

function labRelyingParties(): RelyingParties {
  return new RelyingParties([LAB_RELYING_PARTY, ONION_RELYING_PARTY])
}

export { LAB_RELYING_PARTY, labRelyingParties, ONION_RELYING_PARTY }
