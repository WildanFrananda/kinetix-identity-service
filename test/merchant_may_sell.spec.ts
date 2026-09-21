import { MAY_SELL, maySell } from "../src/domain/merchant_standing"

describe("a merchant's standing", () => {
  it.each([...MAY_SELL])("lets a %s merchant trade", (status) => {
    expect(maySell(status)).toBe(true)
  })

  it.each(["pending", "suspended"])("stops a %s merchant trading", (status) => {
    expect(maySell(status)).toBe(false)
  })

  it("stops a standing it has never heard of, rather than allowing it", () => {
    expect(maySell("under_review")).toBe(false)
    expect(maySell("")).toBe(false)
  })

  it("names at least one standing that may trade, so the list is not empty by accident", () => {
    expect(MAY_SELL.length).toBeGreaterThan(0)
  })
})
