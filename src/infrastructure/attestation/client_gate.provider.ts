import { ConfigService } from "@nestjs/config"
import type { Provider } from "@nestjs/common"
import ClientGateService from "../../application/services/client_gate.service"
import { clientRegistryFrom } from "../config/client_registry"
import AppCheckKeySet from "./app_check_key_set"
import { APP_CHECK_JWKS_URL } from "./app_check_protocol"
import FirebaseAppCheckVerifier from "./firebase_app_check_verifier"

function clientGateFrom(config: ConfigService): ClientGateService {
  const registry = clientRegistryFrom(function (name: string): string | undefined {
    return config.get<string>(name)
  })

  if (registry.firebaseProjectNumber === null) {
    return new ClientGateService(registry, null)
  }

  const verifier = new FirebaseAppCheckVerifier(
    registry.firebaseProjectNumber,
    new AppCheckKeySet(APP_CHECK_JWKS_URL, Date.now),
    Date.now
  )

  return new ClientGateService(registry, verifier)
}

const CLIENT_GATE_PROVIDER: Provider = {
  provide: ClientGateService,
  inject: [ConfigService],
  useFactory: clientGateFrom
}

export { CLIENT_GATE_PROVIDER, clientGateFrom }
