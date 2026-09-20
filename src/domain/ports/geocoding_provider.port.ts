import type { GeocodeFailure, ProviderPoint } from "../../types/geo.type"

interface GeocodingProviderPort {
  lookup(query: string): Promise<ProviderPoint | GeocodeFailure>
}

export default GeocodingProviderPort
