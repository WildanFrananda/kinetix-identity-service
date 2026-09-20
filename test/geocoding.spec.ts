import GeocodingUsecaseService from "../src/application/services/geocoding_usecase.service"
import type GeocodedAddressRepositoryPort from "../src/domain/ports/geocoded_address_repository.port"
import type GeocodingProviderPort from "../src/domain/ports/geocoding_provider.port"
import type { GeocodeFailure, ProviderPoint } from "../src/types/geo.type"

const JAKARTA: ProviderPoint = {
  latitude: -6.1754,
  longitude: 106.8272,
  precision: "ROOFTOP",
  displayName: "Jl. Cikini Raya No. 99, Jakarta Pusat"
}

class StubProvider implements GeocodingProviderPort {
  public calls: string[] = []

  constructor(private readonly answer: ProviderPoint | GeocodeFailure = JAKARTA) {}

  async lookup(query: string): Promise<ProviderPoint | GeocodeFailure> {
    this.calls.push(query)
    return this.answer
  }
}

class StubCache implements GeocodedAddressRepositoryPort {
  public readonly stored = new Map<string, ProviderPoint>()
  public forgotten: string[] = []

  async findByQuery(query: string): Promise<ProviderPoint | null> {
    return this.stored.get(query) ?? null
  }

  async remember(query: string, _provider: string, point: ProviderPoint): Promise<void> {
    this.stored.set(query, point)
  }

  async forget(query: string): Promise<void> {
    this.forgotten.push(query)
    this.stored.delete(query)
  }
}

function service(provider: GeocodingProviderPort, cache: GeocodedAddressRepositoryPort) {
  return new GeocodingUsecaseService(provider, cache)
}

describe("GeocodingUsecaseService", () => {
  describe("an address it can place", () => {
    it("answers with the point", async () => {
      const outcome = await service(new StubProvider(), new StubCache()).geocode({
        streetAddress: "Jl. Cikini Raya No. 99",
        city: "Jakarta Pusat"
      })

      expect(outcome.geocoded).toBe(true)
      if (!outcome.geocoded) return
      expect(outcome.location).toEqual({ latitude: -6.1754, longitude: 106.8272 })
      expect(outcome.precision).toBe("ROOFTOP")
    })

    it("remembers it, so the same address is not paid for twice", async () => {
      const provider = new StubProvider()
      const cache = new StubCache()
      const geocoding = service(provider, cache)

      await geocoding.geocode({ streetAddress: "Jl. Cikini Raya No. 99" })
      await geocoding.geocode({ streetAddress: "Jl. Cikini Raya No. 99" })

      expect(provider.calls).toHaveLength(1)
    })

    it("treats differently-written spellings of one address as one question", async () => {
      const provider = new StubProvider()
      const geocoding = service(provider, new StubCache())

      await geocoding.geocode({ streetAddress: "Jl. Cikini Raya No. 99" })
      await geocoding.geocode({ streetAddress: "  jl.   CIKINI raya   no. 99 " })

      expect(provider.calls).toHaveLength(1)
    })

    it("keeps the postcode, because it is often what separates two identical street names", async () => {
      const provider = new StubProvider()

      await service(provider, new StubCache()).geocode({
        streetAddress: "Jl. Merdeka",
        city: "Bandung",
        postalCode: "40111"
      })

      expect(provider.calls[0]).toContain("40111")
    })
  })

  describe("an address it cannot place", () => {
    it("says not found rather than answering with a point", async () => {
      const outcome = await service(new StubProvider("NOT_FOUND"), new StubCache()).geocode({
        streetAddress: "nowhere at all"
      })

      expect(outcome.geocoded).toBe(false)
      if (outcome.geocoded) return
      expect(outcome.failure).toBe("NOT_FOUND")
    })

    it("does not remember a failure, so a provider outage is not cached for ever", async () => {
      const cache = new StubCache()

      await service(new StubProvider("PROVIDER_UNAVAILABLE"), cache).geocode({
        streetAddress: "Jl. Cikini Raya No. 99"
      })

      expect(cache.stored.size).toBe(0)
    })

    it("refuses an empty address without asking the geocoder", async () => {
      const provider = new StubProvider()

      const outcome = await service(provider, new StubCache()).geocode({ streetAddress: "   " })

      expect(outcome.geocoded).toBe(false)
      if (outcome.geocoded) return
      expect(outcome.failure).toBe("INSUFFICIENT_ADDRESS")
      expect(provider.calls).toHaveLength(0)
    })
  })

  describe("a remembered address", () => {
    it("is served without asking the geocoder, which is what keeps dispatch working when it is down", async () => {
      const cache = new StubCache()
      await cache.remember("jl. cikini raya no. 99", "stub", JAKARTA)

      const provider = new StubProvider("PROVIDER_UNAVAILABLE")
      const outcome = await service(provider, cache).geocode({
        streetAddress: "Jl. Cikini Raya No. 99"
      })

      expect(outcome.geocoded).toBe(true)
      expect(provider.calls).toHaveLength(0)
    })

    it("can be forgotten, by the normalised form and not the one that was typed", async () => {
      const cache = new StubCache()
      await cache.remember("jl. cikini raya no. 99", "stub", JAKARTA)

      await service(new StubProvider(), cache).forget({ streetAddress: "  JL. Cikini Raya No. 99 " })

      expect(cache.forgotten).toEqual(["jl. cikini raya no. 99"])
    })
  })
})
