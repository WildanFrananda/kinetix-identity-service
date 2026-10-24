import { plainToInstance } from "class-transformer"
import { validate } from "class-validator"
import LoginInputDto from "../src/application/dto/login_input.dto"
import LogoutInputDto from "../src/application/dto/logout_input.dto"
import OnboardSellerInputDto from "../src/application/dto/onboard_seller_input.dto"
import RegisterCourierInputDto from "../src/application/dto/register_courier_input.dto"
import RegisterUserInputDto from "../src/application/dto/register_user_input.dto"
import UpdateProfileInputDto from "../src/application/dto/update_profile_input.dto"

async function refusedFields(type: new () => object, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((error) => error.property)
}

const COURIER = {
  email: "driver@kinetix.test",
  password: "fixture-password-not-real",
  fullName: "Budi Santoso",
  phoneNumber: "081200000000",
  vehiclePlate: "B 1234 KIN",
  capacityKg: 150
}

const SELLER = {
  storeName: "Kinetix Store",
  businessRegistrationNumber: "REG-100",
  taxId: "TAX-200",
  streetAddress: "Jl. Cikini Raya No. 99",
  city: "Jakarta",
  postalCode: "10330"
}

describe("what the input DTOs accept", () => {
  describe("passwords", () => {
    function registering(password: string): Record<string, string> {
      return { email: "a@kinetix.test", password }
    }

    it("asks a new customer for the same twelve characters a courier is asked for", async () => {
      expect(await refusedFields(RegisterUserInputDto, registering("elevenchars"))).toEqual(["password"])
      expect(await refusedFields(RegisterUserInputDto, registering("twelve-chars"))).toEqual([])
    })

    it("refuses a password longer than the 72 bytes bcrypt reads", async () => {
      const multibyte = { ...COURIER, password: "é".repeat(37) }

      expect(await refusedFields(RegisterUserInputDto, registering("a".repeat(72)))).toEqual([])
      expect(await refusedFields(RegisterUserInputDto, registering("a".repeat(73)))).toEqual(["password"])
      expect(await refusedFields(RegisterCourierInputDto, multibyte)).toEqual(["password"])
    })

    it("still lets an account made under the old six-character rule sign in", async () => {
      expect(await refusedFields(LoginInputDto, registering("sixsix"))).toEqual([])
    })

    it("bounds what login reads", async () => {
      expect(await refusedFields(LoginInputDto, registering("a".repeat(1025)))).toEqual(["password"])
    })
  })

  it("refuses an email longer than an address can be", async () => {
    const email = `${"a".repeat(64)}@${"b".repeat(186)}.com`

    expect(await refusedFields(LoginInputDto, { email, password: "sixsix" })).toContain("email")
  })

  describe("a profile", () => {
    it.each(["javascript:alert(1)", "http://cdn.example.com/a.png", "data:image/png;base64,AAAA", "not a url"])(
      "refuses %s as an avatar",
      async (avatarUrl) => {
        expect(await refusedFields(UpdateProfileInputDto, { avatarUrl })).toEqual(["avatarUrl"])
      }
    )

    it("takes an https avatar", async () => {
      expect(await refusedFields(UpdateProfileInputDto, { avatarUrl: "https://cdn.example.com/a.png" })).toEqual([])
    })

    it.each(["0812-0000-0000", "phone", "12345", "+62 812 0000 0000", "1".repeat(16)])(
      "refuses %s as a phone number",
      async (phoneNumber) => {
        expect(await refusedFields(UpdateProfileInputDto, { phoneNumber })).toEqual(["phoneNumber"])
      }
    )

    it.each(["081200000000", "+6281200000000"])("takes %s as a phone number", async (phoneNumber) => {
      expect(await refusedFields(UpdateProfileInputDto, { phoneNumber })).toEqual([])
    })

    it.each(["fullName", "phoneNumber", "streetAddress", "city", "postalCode"])(
      "refuses null for %s, a value that cannot be cleared",
      async (field) => {
        expect(await refusedFields(UpdateProfileInputDto, { [field]: null })).toEqual([field])
      }
    )

    it("lets null clear the avatar", async () => {
      expect(await refusedFields(UpdateProfileInputDto, { avatarUrl: null })).toEqual([])
    })

    it("still takes a profile update that leaves fields out", async () => {
      expect(await refusedFields(UpdateProfileInputDto, { city: "Jakarta" })).toEqual([])
    })

    it("refuses an address too long to be one", async () => {
      const refused = await refusedFields(UpdateProfileInputDto, { streetAddress: "x".repeat(256) })

      expect(refused).toEqual(["streetAddress"])
    })
  })

  it("refuses a logout that sends a null refresh token", async () => {
    expect(await refusedFields(LogoutInputDto, { refreshToken: null })).toEqual(["refreshToken"])
    expect(await refusedFields(LogoutInputDto, {})).toEqual([])
  })

  it("bounds every field of a seller application", async () => {
    const tooLong: Record<string, string> = {
      storeName: "x".repeat(121),
      businessRegistrationNumber: "x".repeat(65),
      taxId: "x".repeat(33),
      streetAddress: "x".repeat(256),
      city: "x".repeat(101),
      postalCode: "x".repeat(17)
    }

    expect(await refusedFields(OnboardSellerInputDto, SELLER)).toEqual([])
    for (const [field, value] of Object.entries(tooLong)) {
      expect(await refusedFields(OnboardSellerInputDto, { ...SELLER, [field]: value })).toEqual([field])
    }
  })

  it.each([
    ["fullName", "x".repeat(121)],
    ["phoneNumber", "call me"],
    ["vehiclePlate", "x".repeat(21)]
  ])("bounds a courier's %s", async (field, value) => {
    expect(await refusedFields(RegisterCourierInputDto, COURIER)).toEqual([])
    expect(await refusedFields(RegisterCourierInputDto, { ...COURIER, [field]: value })).toEqual([field])
  })
})
