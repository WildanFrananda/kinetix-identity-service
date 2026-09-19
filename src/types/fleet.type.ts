type RegisterDriverCommand = {
  principalId: string
  vehiclePlate: string
  capacityKg: number
}

type FleetRegistration = {
  driverId: number
  alreadyRegistered: boolean
}

type FleetActivation = {
  driverId: number
  alreadyActive: boolean
}

type FleetFailure = {
  kind: "refused" | "unknown"
  code: string
  message: string
}

export type { FleetActivation, FleetFailure, FleetRegistration, RegisterDriverCommand }
