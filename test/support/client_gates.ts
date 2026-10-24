import ClientGateService from "../../src/application/services/client_gate.service"
import ClientProofVerifierPort from "../../src/domain/ports/client_proof_verifier.port"
import AppCheckKeySet from "../../src/infrastructure/attestation/app_check_key_set"
import FirebaseAppCheckVerifier from "../../src/infrastructure/attestation/firebase_app_check_verifier"
import { clientRegistryFrom } from "../../src/infrastructure/config/client_registry"
import type { CallContext } from "../../src/types/call_context.type"
import FakeAppCheck from "./fake_app_check"
import TestClock from "./test_clock"

const LAB_CLIENTS: Readonly<Record<string, string>> = {
  IDENTITY_CLIENTS: "courier-app:none",
  IDENTITY_UNNAMED_CLIENTS: "allow"
}

function clientGateFor(
  settings: Readonly<Record<string, string>>,
  verifier: ClientProofVerifierPort | null = null
): ClientGateService {
  return new ClientGateService(
    clientRegistryFrom(function (name: string): string | undefined {
      return settings[name]
    }),
    verifier
  )
}

function labClientGate(): ClientGateService {
  return clientGateFor(LAB_CLIENTS)
}

function attestedSettings(fake: FakeAppCheck): Record<string, string> {
  return {
    IDENTITY_CLIENTS: "courier-app:app_check,seller-web:none",
    IDENTITY_UNNAMED_CLIENTS: "allow",
    FIREBASE_PROJECT_NUMBER: fake.projectNumber,
    IDENTITY_APP_CHECK_APP_IDS_COURIER_APP: `${fake.androidAppId},${fake.iosAppId}`
  }
}

function attestedGate(
  fake: FakeAppCheck,
  clock: TestClock,
  overrides: Readonly<Record<string, string>> = {}
): ClientGateService {
  const reading = clock.reading()

  return clientGateFor(
    { ...attestedSettings(fake), ...overrides },
    new FirebaseAppCheckVerifier(fake.projectNumber, new AppCheckKeySet(fake.url, reading), reading)
  )
}

function unnamedContext(requestId: string): CallContext {
  return { requestId, client: { kind: "unnamed" } }
}

export { attestedGate, attestedSettings, clientGateFor, LAB_CLIENTS, labClientGate, unnamedContext }
