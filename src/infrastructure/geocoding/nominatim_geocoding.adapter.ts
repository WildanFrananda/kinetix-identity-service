import { Injectable, Logger } from "@nestjs/common"
import GeocodingProviderPort from "../../domain/ports/geocoding_provider.port"
import type { GeocodeFailure, GeocodePrecision, ProviderPoint } from "../../types/geo.type"

const DEFAULT_BASE = "https://nominatim.openstreetmap.org"

@Injectable()
class NominatimGeocodingAdapter implements GeocodingProviderPort {
  private readonly logger = new Logger(NominatimGeocodingAdapter.name)

  async lookup(query: string): Promise<ProviderPoint | GeocodeFailure> {
    const url = new URL(`${this.baseUrl()}/search`)
    url.searchParams.set("q", query)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("limit", "1")
    url.searchParams.set("addressdetails", "0")

    let response: Response

    try {
      response = await fetch(url, {
        headers: {
          "user-agent": this.userAgent(),
          "accept-language": "id,en"
        },
        signal: AbortSignal.timeout(8000)
      })
    } catch (error) {
      return this.unavailable(query, error instanceof Error ? error.message : String(error))
    }

    if (response.status === 429) {
      this.logger.warn(`the geocoder rate-limited the lookup of ${JSON.stringify(query)}`)
      return "PROVIDER_UNAVAILABLE"
    }

    if (!response.ok) {
      return this.unavailable(query, `HTTP ${response.status}`)
    }

    let body: unknown

    try {
      body = await response.json()
    } catch (error) {
      return this.unavailable(query, `body was not JSON: ${String(error)}`)
    }

    return this.firstPoint(body, query)
  }

  private firstPoint(body: unknown, query: string): ProviderPoint | GeocodeFailure {
    if (!Array.isArray(body)) {
      return this.unavailable(query, `unexpected body: ${JSON.stringify(body)?.slice(0, 200)}`)
    }

    if (body.length === 0) {
      return "NOT_FOUND"
    }

    const first = body[0] as Record<string, unknown>
    const latitude = Number(first["lat"])
    const longitude = Number(first["lon"])

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return this.unavailable(
        query,
        `coordinates were not numbers: ${JSON.stringify(first["lat"])},${JSON.stringify(first["lon"])}`
      )
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return this.unavailable(query, `answered with a point that is not on Earth: ${latitude},${longitude}`)
    }

    const displayName = typeof first["display_name"] === "string" ? first["display_name"] : undefined

    return {
      latitude,
      longitude,
      precision: this.precisionOf(first),
      displayName
    }
  }

  private precisionOf(result: Record<string, unknown>): GeocodePrecision {
    const addressType = String(result["addresstype"] ?? "").toLowerCase()

    if (["building", "house", "amenity", "shop", "office"].includes(addressType)) return "ROOFTOP"
    if (["road", "residential", "street"].includes(addressType)) return "STREET"
    if (["suburb", "neighbourhood", "village", "quarter"].includes(addressType)) return "SUBURB"
    if (["city", "town", "municipality", "county", "state"].includes(addressType)) return "CITY"

    return "UNSPECIFIED"
  }

  private unavailable(query: string, detail: string): GeocodeFailure {
    this.logger.error(`could not geocode ${JSON.stringify(query)}: ${detail}`)
    return "PROVIDER_UNAVAILABLE"
  }

  private baseUrl(): string {
    const configured = process.env.GEOCODER_BASE_URL
    return configured && configured.length > 0 ? configured : DEFAULT_BASE
  }

  private userAgent(): string {
    const configured = process.env.GEOCODER_USER_AGENT
    return configured && configured.length > 0 ? configured : "kinetix-identity-service"
  }
}

export default NominatimGeocodingAdapter
