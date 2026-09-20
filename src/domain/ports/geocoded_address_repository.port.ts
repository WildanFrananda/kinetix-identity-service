import type { ProviderPoint } from "../../types/geo.type"

interface GeocodedAddressRepositoryPort {
  findByQuery(query: string): Promise<ProviderPoint | null>
  remember(query: string, provider: string, point: ProviderPoint): Promise<void>
  forget(query: string): Promise<void>
}

export default GeocodedAddressRepositoryPort
