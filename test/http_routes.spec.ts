import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import AuthController from "../src/adapters/controllers/auth.controller"
import CourierOnboardingController from "../src/adapters/controllers/courier_onboarding.controller"
import SellerOnboardingController from "../src/adapters/controllers/seller_onboarding.controller"
import UserProfileController from "../src/adapters/controllers/user_profile.controller"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../src/application/services/courier_registration_usecase.service"
import SellerOnboardingUsecaseService from "../src/application/services/seller_onboarding_usecase.service"
import UserProfileUsecaseService from "../src/application/services/user_profile_usecase.service"
import { CALLER_HEADER, claimsFor, httpApp, send } from "./support/http_app"

const COURIER_PRINCIPAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

const EMPTY_PAGE = { applications: [], nextAfterId: null }

describe("identity's HTTP routes", () => {
  let app: NestFastifyApplication
  let auth: Record<string, jest.Mock>
  let couriers: Record<string, jest.Mock>
  let sellers: Record<string, jest.Mock>
  let profiles: Record<string, jest.Mock>

  beforeEach(async () => {
    auth = { logout: jest.fn().mockResolvedValue(undefined) }
    couriers = {
      approveCourier: jest.fn().mockResolvedValue({ principalId: COURIER_PRINCIPAL }),
      listApplications: jest.fn().mockResolvedValue(EMPTY_PAGE)
    }
    sellers = {
      listApplications: jest.fn().mockResolvedValue(EMPTY_PAGE),
      applicationOf: jest.fn().mockResolvedValue({ userId: 7, status: "pending" }),
      rejectVerification: jest.fn().mockResolvedValue({ userId: 7, status: "rejected" })
    }
    profiles = { updateProfile: jest.fn().mockResolvedValue({}) }

    app = await httpApp(
      [AuthController, CourierOnboardingController, SellerOnboardingController, UserProfileController],
      [
        { provide: AuthUsecaseService, useValue: auth },
        { provide: CourierOnboardingUsecaseService, useValue: couriers },
        { provide: CourierRegistrationUsecaseService, useValue: {} },
        { provide: SellerOnboardingUsecaseService, useValue: sellers },
        { provide: UserProfileUsecaseService, useValue: profiles }
      ],
      {
        admin: claimsFor("admin", 1, "11111111-1111-4111-8111-111111111111"),
        seller7: claimsFor("customer", 7, "77777777-7777-4777-8777-777777777777"),
        customer8: claimsFor("customer", 8, "88888888-8888-4888-8888-888888888888")
      }
    )
  })

  afterEach(async () => {
    await app.close()
  })

  describe("courier approval", () => {
    it("refuses a principal id that is not a UUID with 400, before anything reads it", async () => {
      const response = await send(app, {
        method: "POST",
        url: "/api/v1/couriers/not-a-uuid/approve",
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(response.statusCode).toBe(400)
      expect(couriers.approveCourier).not.toHaveBeenCalled()
    })

    it("passes a UUID through", async () => {
      const response = await send(app, {
        method: "POST",
        url: `/api/v1/couriers/${COURIER_PRINCIPAL}/approve`,
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(response.statusCode).toBe(200)
      expect(couriers.approveCourier).toHaveBeenCalledWith(COURIER_PRINCIPAL)
    })
  })

  describe("applicant lists", () => {
    it("lists courier applicants for an admin, filtered and paged as asked", async () => {
      const response = await send(app, {
        method: "GET",
        url: "/api/v1/couriers/applications?status=pending&limit=20&after=40",
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(response.statusCode).toBe(200)
      expect(couriers.listApplications).toHaveBeenCalledWith({ status: "pending", afterId: 40, limit: 20 })
    })

    it("lists seller applicants for an admin, every status by default", async () => {
      const response = await send(app, {
        method: "GET",
        url: "/api/v1/sellers/applications",
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(response.statusCode).toBe(200)
      expect(sellers.listApplications).toHaveBeenCalledWith({ status: null, afterId: 0, limit: 50 })
    })

    it.each(["/api/v1/couriers/applications", "/api/v1/sellers/applications"])(
      "refuses %s to anyone but an admin",
      async (url) => {
        const response = await send(app, { method: "GET", url, headers: { [CALLER_HEADER]: "customer8" } })

        expect(response.statusCode).toBe(403)
      }
    )

    it.each(["status=approved", "status=bogus", "limit=0", "limit=201", "limit=0x10", "after=1e3", "after=-1"])(
      "refuses a seller list asked with %s",
      async (query) => {
        const response = await send(app, {
          method: "GET",
          url: `/api/v1/sellers/applications?${query}`,
          headers: { [CALLER_HEADER]: "admin" }
        })

        expect(response.statusCode).toBe(400)
        expect(sellers.listApplications).not.toHaveBeenCalled()
      }
    )
  })

  describe("a seller application", () => {
    it("is readable by its applicant", async () => {
      const response = await send(app, {
        method: "GET",
        url: "/api/v1/sellers/7/application",
        headers: { [CALLER_HEADER]: "seller7" }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe("pending")
    })

    it("is not readable by another customer", async () => {
      const response = await send(app, {
        method: "GET",
        url: "/api/v1/sellers/7/application",
        headers: { [CALLER_HEADER]: "customer8" }
      })

      expect(response.statusCode).toBe(403)
    })

    it("can be rejected by an admin only", async () => {
      const refused = await send(app, {
        method: "POST",
        url: "/api/v1/sellers/7/reject",
        headers: { [CALLER_HEADER]: "seller7" }
      })
      const rejected = await send(app, {
        method: "POST",
        url: "/api/v1/sellers/7/reject",
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(refused.statusCode).toBe(403)
      expect(rejected.statusCode).toBe(200)
      expect(sellers.rejectVerification).toHaveBeenCalledWith(7)
    })
  })

  describe("account ids in the path", () => {
    it.each(["0", "-1", "2147483648", "99999999999", "007", "0x10", "1e3"])(
      "refuses %s as an account id with 400",
      async (id) => {
        const response = await send(app, {
          method: "PUT",
          url: `/api/v1/users/${id}/profile`,
          payload: { fullName: "Budi" },
          headers: { [CALLER_HEADER]: "admin" }
        })

        expect(response.statusCode).toBe(400)
        expect(profiles.updateProfile).not.toHaveBeenCalled()
      }
    )

    it("accepts the largest id the column holds", async () => {
      const response = await send(app, {
        method: "PUT",
        url: "/api/v1/users/2147483647/profile",
        payload: { fullName: "Budi" },
        headers: { [CALLER_HEADER]: "admin" }
      })

      expect(response.statusCode).toBe(200)
      expect(profiles.updateProfile).toHaveBeenCalledWith(2147483647, { fullName: "Budi" })
    })
  })

  describe("a profile update", () => {
    it.each(["fullName", "phoneNumber", "streetAddress", "city", "postalCode"])(
      "refuses null for %s with 400, before anything is written",
      async (field) => {
        const response = await send(app, {
          method: "PUT",
          url: "/api/v1/users/8/profile",
          payload: { [field]: null },
          headers: { [CALLER_HEADER]: "customer8" }
        })

        expect(response.statusCode).toBe(400)
        expect(profiles.updateProfile).not.toHaveBeenCalled()
      }
    )

    it("passes a null avatar through, which clears it", async () => {
      const response = await send(app, {
        method: "PUT",
        url: "/api/v1/users/8/profile",
        payload: { avatarUrl: null },
        headers: { [CALLER_HEADER]: "customer8" }
      })

      expect(response.statusCode).toBe(200)
      expect(profiles.updateProfile).toHaveBeenCalledWith(8, { avatarUrl: null })
    })
  })

  describe("logout", () => {
    it("takes no body", async () => {
      const response = await send(app, {
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { [CALLER_HEADER]: "customer8" }
      })

      expect(response.statusCode).toBe(204)
      expect(auth.logout).toHaveBeenCalledWith(expect.objectContaining({ uid: 8 }), undefined)
    })

    it.each([{ refreshToken: 5 }, { refreshToken: "" }, { refreshToken: null }, { refreshToken: "t", extra: "x" }])(
      "refuses the body %j with 400",
      async (payload) => {
        const response = await send(app, {
          method: "POST",
          url: "/api/v1/auth/logout",
          payload,
          headers: { [CALLER_HEADER]: "customer8" }
        })

        expect(response.statusCode).toBe(400)
        expect(auth.logout).not.toHaveBeenCalled()
      }
    )
  })
})
