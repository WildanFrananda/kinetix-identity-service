import type {
  FleetActivation,
  FleetRegistration,
  RegisterDriverCommand
} from "../../types/fleet.type"

interface FleetRegistryPort {
  registerDriver(command: RegisterDriverCommand): Promise<FleetRegistration>
  activateDriver(principalId: string): Promise<FleetActivation>
}

export default FleetRegistryPort
