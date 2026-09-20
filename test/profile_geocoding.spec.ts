import UserProfileUsecaseService from "../src/application/services/user_profile_usecase.service"
import ProfileEntity from "../src/domain/entities/profile.entity"
import type ProfileRepositoryPort from "../src/domain/ports/profile_repository.port"
import type GeocodingUsecaseService from "../src/application/services/geocoding_usecase.service"
import type { GeocodeOutcome } from "../src/types/geo.type"

const CIKINI: GeocodeOutcome = {
  geocoded: true,
  location: { latitude: -6.1754, longitude: 106.8272 },
  precision: "ROOFTOP"
}

const MALIOBORO: GeocodeOutcome = {
  geocoded: true,
  location: { latitude: -7.7926, longitude: 110.3656 },
  precision: "ROOFTOP"
}

class StubRepository implements ProfileRepositoryPort {
  public saved: ProfileEntity[] = []

  constructor(private existing: ProfileEntity | null = null) {}

  async findByUserId(): Promise<ProfileEntity | null> {
    return this.existing
  }

  async save(profile: ProfileEntity): Promise<ProfileEntity> {
    this.saved.push(profile)
    this.existing = profile
    return profile
  }
}

class StubGeocoding {
  public calls: unknown[] = []

  constructor(
    private readonly outcome: GeocodeOutcome = CIKINI,
    private readonly throws: Error | null = null
  ) {}

  async geocode(query: unknown): Promise<GeocodeOutcome> {
    this.calls.push(query)
    if (this.throws) throw this.throws
    return this.outcome
  }

  async forget(): Promise<void> {}
}

function service(repository: ProfileRepositoryPort, geocoding: StubGeocoding) {
  return new UserProfileUsecaseService(
    repository,
    geocoding as unknown as GeocodingUsecaseService
  )
}

function profileAt(street: string, latitude?: number, longitude?: number): ProfileEntity {
  return new ProfileEntity(
    1, 7, "Sarah", "0812", street, "Jakarta", "10330", undefined, latitude, longitude, new Date()
  )
}

describe("saving a profile address", () => {
  it("places a new address on the map", async () => {
    const repository = new StubRepository()
    const geocoding = new StubGeocoding()

    const saved = await service(repository, geocoding).updateProfile(7, {
      streetAddress: "Jl. Cikini Raya No. 99",
      city: "Jakarta",
      postalCode: "10330"
    })

    expect(saved.latitude).toBe(-6.1754)
    expect(saved.longitude).toBe(106.8272)
    expect(geocoding.calls).toHaveLength(1)
  })

  it("does not ask the geocoder when only the avatar changed", async () => {
    const repository = new StubRepository(profileAt("Jl. Cikini Raya No. 99", -6.1754, 106.8272))
    const geocoding = new StubGeocoding()

    await service(repository, geocoding).updateProfile(7, { avatarUrl: "https://example.test/a.png" })

    expect(geocoding.calls).toHaveLength(0)
  })

  it("re-places the address when it changes", async () => {
    const repository = new StubRepository(profileAt("Jl. Cikini Raya No. 99", -6.1754, 106.8272))
    const geocoding = new StubGeocoding(MALIOBORO)

    const saved = await service(repository, geocoding).updateProfile(7, {
      streetAddress: "Jl. Malioboro No. 88"
    })

    expect(saved.latitude).toBe(-7.7926)
    expect(saved.longitude).toBe(110.3656)
  })

  it("drops the old point when the address changes and the geocoder cannot place the new one", async () => {
    const repository = new StubRepository(profileAt("Jl. Cikini Raya No. 99", -6.1754, 106.8272))
    const geocoding = new StubGeocoding({
      geocoded: false,
      failure: "NOT_FOUND",
      detail: "no match"
    })

    const saved = await service(repository, geocoding).updateProfile(7, {
      streetAddress: "somewhere that does not exist"
    })

    expect(saved.latitude).toBeUndefined()
    expect(saved.longitude).toBeUndefined()
  })

  it("saves the address even when the geocoder is down", async () => {
    const repository = new StubRepository()
    const geocoding = new StubGeocoding(CIKINI, new Error("nominatim is unreachable"))

    const saved = await service(repository, geocoding).updateProfile(7, {
      streetAddress: "Jl. Cikini Raya No. 99"
    })

    expect(saved.streetAddress).toBe("Jl. Cikini Raya No. 99")
    expect(saved.latitude).toBeUndefined()
    expect(repository.saved).toHaveLength(1)
  })

  it("tries again on the next save when the address was never placed", async () => {
    const repository = new StubRepository(profileAt("Jl. Cikini Raya No. 99"))
    const geocoding = new StubGeocoding()

    await service(repository, geocoding).updateProfile(7, { phoneNumber: "0813" })

    expect(geocoding.calls).toHaveLength(1)
  })

  it("does not ask about an empty address", async () => {
    const repository = new StubRepository()
    const geocoding = new StubGeocoding()

    await service(repository, geocoding).updateProfile(7, { fullName: "Sarah" })

    expect(geocoding.calls).toHaveLength(0)
  })
})
