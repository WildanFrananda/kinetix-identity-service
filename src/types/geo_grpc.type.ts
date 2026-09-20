type GeoAddressWire = {
  street_address?: string
  streetAddress?: string
  city?: string
  postal_code?: string
  postalCode?: string
}

type GeocodeAddressRequestWire = {
  address?: GeoAddressWire
}

type GeoPointWire = {
  latitude: number
  longitude: number
}

type GeocodeAddressResponseWire = {
  geocoded: boolean
  location: GeoPointWire
  failure: string
  failure_detail: string
  precision: string
}

type GeocodeAddressesRequestWire = {
  addresses?: GeoAddressWire[]
}

type GeocodeAddressesResponseWire = {
  results: GeocodeAddressResponseWire[]
}

export type {
  GeoAddressWire,
  GeocodeAddressRequestWire,
  GeocodeAddressResponseWire,
  GeocodeAddressesRequestWire,
  GeocodeAddressesResponseWire,
  GeoPointWire
}
