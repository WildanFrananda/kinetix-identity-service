import { Inject, Injectable, Logger } from "@nestjs/common"
import GeocodedAddressRepositoryPort from "../../domain/ports/geocoded_address_repository.port"
import GeocodingProviderPort from "../../domain/ports/geocoding_provider.port"
import type {
  GeocodeFailure,
  GeocodeOutcome,
  GeocodeQuery,
  ProviderPoint
} from "../../types/geo.type"

const FAILURES: readonly GeocodeFailure[] = [
  "NOT_FOUND",
  "AMBIGUOUS",
  "PROVIDER_UNAVAILABLE",
  "OUT_OF_SERVICE_AREA",
  "INSUFFICIENT_ADDRESS"
]

@Injectable()
class GeocodingUsecaseService {
  private readonly logger = new Logger(GeocodingUsecaseService.name)

  constructor(
    @Inject("GeocodingProviderPort")
    private readonly provider: GeocodingProviderPort,
    @Inject("GeocodedAddressRepositoryPort")
    private readonly cache: GeocodedAddressRepositoryPort
  ) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeOutcome> {
    const normalised = this.normalise(query)

    if (normalised.length === 0) {
      return {
        geocoded: false,
        failure: "INSUFFICIENT_ADDRESS",
        detail: "the address was empty once normalised, so there is nothing to look up"
      }
    }

    const remembered = await this.cache.findByQuery(normalised)
    if (remembered) {
      return this.success(remembered)
    }

    const answer = await this.provider.lookup(normalised)

    if (this.isFailure(answer)) {
      return {
        geocoded: false,
        failure: answer,
        detail: `the geocoder did not place ${JSON.stringify(normalised)}`
      }
    }

    await this.cache.remember(normalised, this.provider.constructor.name, answer)

    return this.success(answer)
  }

  async forget(query: GeocodeQuery): Promise<void> {
    await this.cache.forget(this.normalise(query))
  }

  private normalise(query: GeocodeQuery): string {
    return [query.streetAddress, query.city, query.postalCode]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(", ")
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, " ")
  }

  private isFailure(answer: ProviderPoint | GeocodeFailure): answer is GeocodeFailure {
    return typeof answer === "string" && FAILURES.includes(answer)
  }

  private success(point: ProviderPoint): GeocodeOutcome {
    return {
      geocoded: true,
      location: { latitude: point.latitude, longitude: point.longitude },
      precision: point.precision,
      displayName: point.displayName
    }
  }
}

export default GeocodingUsecaseService
