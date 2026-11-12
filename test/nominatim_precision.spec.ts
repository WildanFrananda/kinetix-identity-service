import { nominatimPrecisionOf } from "../src/infrastructure/geocoding/nominatim_precision"

function road(type: string): Record<string, unknown> {
  return { category: "highway", type, addresstype: type, place_rank: 26 }
}

describe("nominatimPrecisionOf", () => {
  it("places a main road at street level, as Nominatim names it by its OSM class", () => {
    expect(nominatimPrecisionOf(road("primary"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("secondary"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("tertiary"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("trunk"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("living_street"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("service"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("unclassified"))).toBe("STREET")
  })

  it("places a residential street and an alley at street level", () => {
    expect(nominatimPrecisionOf(road("residential"))).toBe("STREET")
    expect(nominatimPrecisionOf(road("footway"))).toBe("STREET")
    expect(nominatimPrecisionOf({ addresstype: "road" })).toBe("STREET")
  })

  it("does not take a highway point that is not a road for a street", () => {
    expect(nominatimPrecisionOf({ category: "highway", type: "bus_stop", addresstype: "highway" })).toBe(
      "UNSPECIFIED"
    )
  })

  it("keeps a building, a suburb and a city where they were", () => {
    expect(nominatimPrecisionOf({ category: "building", type: "yes", addresstype: "building" })).toBe("ROOFTOP")
    expect(nominatimPrecisionOf({ category: "place", type: "suburb", addresstype: "suburb" })).toBe("SUBURB")
    expect(nominatimPrecisionOf({ category: "boundary", type: "administrative", addresstype: "city" })).toBe("CITY")
  })

  it("answers unspecified for a result it cannot read", () => {
    expect(nominatimPrecisionOf({})).toBe("UNSPECIFIED")
  })
})
