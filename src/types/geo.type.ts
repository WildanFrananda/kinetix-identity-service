type GeoPoint = {
  latitude: number
  longitude: number
}

type GeocodeFailure =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "PROVIDER_UNAVAILABLE"
  | "OUT_OF_SERVICE_AREA"
  | "INSUFFICIENT_ADDRESS"

type GeocodePrecision = "UNSPECIFIED" | "ROOFTOP" | "STREET" | "SUBURB" | "CITY"

type GeocodeSuccess = {
  geocoded: true
  location: GeoPoint
  precision: GeocodePrecision
  displayName?: string
}

type GeocodeRefusal = {
  geocoded: false
  failure: GeocodeFailure
  detail: string
}

type GeocodeOutcome = GeocodeSuccess | GeocodeRefusal

type GeocodeQuery = {
  streetAddress: string
  city?: string
  postalCode?: string
}

type ProviderPoint = {
  latitude: number
  longitude: number
  precision: GeocodePrecision
  displayName?: string
}

export type {
  GeocodeFailure,
  GeocodeOutcome,
  GeocodePrecision,
  GeocodeQuery,
  GeocodeRefusal,
  GeocodeSuccess,
  GeoPoint,
  ProviderPoint
}
