import { Controller, Logger } from "@nestjs/common"
import { GrpcMethod } from "@nestjs/microservices"
import GeocodingUsecaseService from "../../application/services/geocoding_usecase.service"
import type {
  GeoAddressWire,
  GeocodeAddressRequestWire,
  GeocodeAddressResponseWire,
  GeocodeAddressesRequestWire,
  GeocodeAddressesResponseWire
} from "../../types/geo_grpc.type"
import type { GeocodeOutcome, GeocodeQuery } from "../../types/geo.type"

const MAX_BATCH = 25

@Controller()
class GeoGrpcController {
  private readonly logger = new Logger(GeoGrpcController.name)

  constructor(private readonly geocoding: GeocodingUsecaseService) {}

  @GrpcMethod("GeocodingService", "GeocodeAddress")
  async geocodeAddress(data: GeocodeAddressRequestWire): Promise<GeocodeAddressResponseWire> {
    const outcome = await this.geocoding.geocode(this.queryOf(data.address))
    return this.responseOf(outcome)
  }

  @GrpcMethod("GeocodingService", "GeocodeAddresses")
  async geocodeAddresses(
    data: GeocodeAddressesRequestWire
  ): Promise<GeocodeAddressesResponseWire> {
    const addresses = data.addresses ?? []

    if (addresses.length > MAX_BATCH) {
      this.logger.warn(
        `refusing a batch of ${addresses.length} addresses; the geocoder's usage policy does not ` +
          `permit bulk lookups, so the caller must ask in batches of ${MAX_BATCH} or fewer`
      )

      return {
        results: addresses.map(() => ({
          geocoded: false,
          location: { latitude: 0, longitude: 0 },
          failure: "GEOCODE_FAILURE_UNSPECIFIED",
          failure_detail: `a batch may hold at most ${MAX_BATCH} addresses`,
          precision: "GEOCODE_PRECISION_UNSPECIFIED"
        }))
      }
    }

    const results: GeocodeAddressResponseWire[] = []

    for (const address of addresses) {
      const outcome = await this.geocoding.geocode(this.queryOf(address))
      results.push(this.responseOf(outcome))
    }

    return { results }
  }

  private queryOf(address: GeoAddressWire | undefined): GeocodeQuery {
    return {
      streetAddress: address?.street_address ?? address?.streetAddress ?? "",
      city: address?.city,
      postalCode: address?.postal_code ?? address?.postalCode
    }
  }

  private responseOf(outcome: GeocodeOutcome): GeocodeAddressResponseWire {
    if (outcome.geocoded) {
      return {
        geocoded: true,
        location: outcome.location,
        failure: "GEOCODE_FAILURE_UNSPECIFIED",
        failure_detail: "",
        precision: `GEOCODE_PRECISION_${outcome.precision}`
      }
    }

    return {
      geocoded: false,
      location: { latitude: 0, longitude: 0 },
      failure: `GEOCODE_FAILURE_${outcome.failure}`,
      failure_detail: outcome.detail,
      precision: "GEOCODE_PRECISION_UNSPECIFIED"
    }
  }
}

export default GeoGrpcController
