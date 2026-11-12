import type { GeocodePrecision } from "../../types/geo.type"

const ROOFTOP_TYPES: readonly string[] = ["building", "house", "amenity", "shop", "office"]
const STREET_TYPES: readonly string[] = ["road", "residential", "street"]
const SUBURB_TYPES: readonly string[] = ["suburb", "neighbourhood", "village", "quarter"]
const CITY_TYPES: readonly string[] = ["city", "town", "municipality", "county", "state"]

const ROAD_HIGHWAYS: readonly string[] = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "pedestrian",
  "road",
  "track",
  "busway",
  "footway",
  "path"
]

function nominatimPrecisionOf(result: Record<string, unknown>): GeocodePrecision {
  const addressType = String(result["addresstype"] ?? "").toLowerCase()
  const category = String(result["category"] ?? "").toLowerCase()
  const type = String(result["type"] ?? "").toLowerCase()

  if (ROOFTOP_TYPES.includes(addressType)) return "ROOFTOP"
  if (STREET_TYPES.includes(addressType)) return "STREET"
  if (category === "highway" && ROAD_HIGHWAYS.includes(type)) return "STREET"
  if (SUBURB_TYPES.includes(addressType)) return "SUBURB"
  if (CITY_TYPES.includes(addressType)) return "CITY"

  return "UNSPECIFIED"
}

export { nominatimPrecisionOf }
