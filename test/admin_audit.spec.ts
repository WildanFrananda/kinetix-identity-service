import { ConflictException, Logger } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import CourierOnboardingController from "../src/adapters/controllers/courier_onboarding.controller"
import SellerOnboardingController from "../src/adapters/controllers/seller_onboarding.controller"
import UserProfileController from "../src/adapters/controllers/user_profile.controller"
import CourierOnboardingUsecaseService from "../src/application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../src/application/services/courier_registration_usecase.service"
import SellerOnboardingUsecaseService from "../src/application/services/seller_onboarding_usecase.service"
import UserProfileUsecaseService from "../src/application/services/user_profile_usecase.service"
import { ADMIN_ACTION_OUTCOMES, ADMIN_ACTIONS } from "../src/infrastructure/observability/admin_actions"
import { metricsRegistry } from "../src/infrastructure/observability/metrics_registry"
import { CALLER_HEADER, claimsFor, httpApp, send } from "./support/http_app"

const ADMIN_PRINCIPAL = "11111111-1111-4111-8111-111111111111"

const COURIER_PRINCIPAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

type LoggedEvent = { message: string; requestId?: string | null; fields?: Record<string, unknown> }

async function actionsCounted(action: string, outcome: string): Promise<number> {
  const metric = await metricsRegistry.getSingleMetric("kinetix_admin_actions_total")?.get()
  const sample = metric?.values.find((value) => value.labels.action === action && value.labels.outcome === outcome)
  return sample?.value ?? 0
}

describe("the admin audit", () => {
  let app: NestFastifyApplication
  let sellers: Record<string, jest.Mock>
  let couriers: Record<string, jest.Mock>
  let profiles: Record<string, jest.Mock>
  let log: jest.SpyInstance

  function audited(): LoggedEvent[] {
    return log.mock.calls
      .map((call) => call[0] as LoggedEvent)
      .filter((event) => event.message === "admin_action")
  }

  beforeEach(async () => {
    log = jest.spyOn(Logger.prototype, "log")
    sellers = {
      listApplications: jest.fn().mockResolvedValue({ applications: [], nextAfterId: null }),
      applicationOf: jest.fn().mockResolvedValue({ userId: 7, status: "pending", principalId: null }),
      onboardSeller: jest.fn().mockResolvedValue({ userId: 7, status: "pending" }),
      approveVerification: jest.fn().mockResolvedValue({ userId: 7, status: "verified" }),
      rejectVerification: jest.fn().mockResolvedValue({ userId: 7, status: "rejected" })
    }
    couriers = {
      listApplications: jest.fn().mockResolvedValue({ applications: [], nextAfterId: null }),
      approveCourier: jest.fn().mockResolvedValue({ principalId: COURIER_PRINCIPAL }),
      rejectCourier: jest.fn().mockResolvedValue({ principalId: COURIER_PRINCIPAL, status: "rejected" })
    }
    profiles = {
      getProfile: jest.fn().mockResolvedValue({ userId: 7 }),
      updateProfile: jest.fn().mockResolvedValue({ userId: 7 })
    }

    app = await httpApp(
      [SellerOnboardingController, CourierOnboardingController, UserProfileController],
      [
        { provide: SellerOnboardingUsecaseService, useValue: sellers },
        { provide: CourierOnboardingUsecaseService, useValue: couriers },
        { provide: CourierRegistrationUsecaseService, useValue: {} },
        { provide: UserProfileUsecaseService, useValue: profiles }
      ],
      {
        admin: claimsFor("admin", 1, ADMIN_PRINCIPAL),
        customer7: claimsFor("customer", 7, "77777777-7777-4777-8777-777777777777")
      }
    )
  })

  afterEach(async () => {
    log.mockRestore()
    await app.close()
  })

  it("records who approved which seller, under the request id", async () => {
    const before = await actionsCounted("identity.seller_verify", "done")

    const response = await send(app, {
      method: "POST",
      url: "/api/v1/sellers/7/verify",
      headers: { [CALLER_HEADER]: "admin", "x-request-id": "req-audit-1" }
    })

    expect(response.statusCode).toBe(200)
    expect(audited()).toEqual([
      {
        message: "admin_action",
        requestId: "req-audit-1",
        fields: {
          event: "admin_action",
          actor: ADMIN_PRINCIPAL,
          action: "identity.seller_verify",
          target: "7",
          outcome: "done"
        }
      }
    ])
    expect(await actionsCounted("identity.seller_verify", "done")).toBe(before + 1)
  })

  it("records a refusal as refused", async () => {
    sellers.rejectVerification.mockRejectedValue(new ConflictException("not pending"))

    await send(app, { method: "POST", url: "/api/v1/sellers/7/reject", headers: { [CALLER_HEADER]: "admin" } })

    expect(audited()[0].fields).toEqual(
      expect.objectContaining({ action: "identity.seller_reject", outcome: "refused" })
    )
  })

  it("records a server fault as failed", async () => {
    couriers.approveCourier.mockRejectedValue(new Error("the database went away"))

    await send(app, {
      method: "POST",
      url: `/api/v1/couriers/${COURIER_PRINCIPAL}/approve`,
      headers: { [CALLER_HEADER]: "admin" }
    })

    expect(audited()[0].fields).toEqual(
      expect.objectContaining({ action: "identity.courier_approve", target: COURIER_PRINCIPAL, outcome: "failed" })
    )
  })

  it("records who rejected which courier", async () => {
    await send(app, {
      method: "POST",
      url: `/api/v1/couriers/${COURIER_PRINCIPAL}/reject`,
      headers: { [CALLER_HEADER]: "admin" }
    })

    expect(audited()[0].fields).toEqual(
      expect.objectContaining({ action: "identity.courier_reject", target: COURIER_PRINCIPAL, outcome: "done" })
    )
  })

  it("records a request refused as malformed", async () => {
    await send(app, {
      method: "GET",
      url: "/api/v1/couriers/applications?limit=0",
      headers: { [CALLER_HEADER]: "admin" }
    })

    expect(audited()[0].fields).toEqual(
      expect.objectContaining({ action: "identity.courier_applications_list", target: "*", outcome: "refused" })
    )
  })

  it.each([
    ["GET", "/api/v1/users/7/profile", "identity.profile_read"],
    ["PUT", "/api/v1/users/7/profile", "identity.profile_update"],
    ["GET", "/api/v1/sellers/7/application", "identity.seller_application_read"],
    ["GET", "/api/v1/sellers/applications", "identity.seller_applications_list"]
  ])("records an admin's %s %s as %s", async (method, url, action) => {
    await send(app, {
      method: method as "GET" | "PUT",
      url,
      headers: { [CALLER_HEADER]: "admin" },
      payload: method === "PUT" ? { city: "Jakarta" } : undefined
    })

    expect(audited().map((event) => event.fields?.action)).toEqual([action])
  })

  it("records nothing when the owner reads their own profile", async () => {
    const response = await send(app, {
      method: "GET",
      url: "/api/v1/users/7/profile",
      headers: { [CALLER_HEADER]: "customer7" }
    })

    expect(response.statusCode).toBe(200)
    expect(audited()).toEqual([])
  })

  it("publishes every action and outcome at zero before any happens", async () => {
    const metric = await metricsRegistry.getSingleMetric("kinetix_admin_actions_total")?.get()
    const series = new Set(metric?.values.map((value) => `${value.labels.action}/${value.labels.outcome}`))

    for (const action of ADMIN_ACTIONS) {
      for (const outcome of ADMIN_ACTION_OUTCOMES) {
        expect(series).toContain(`${action}/${outcome}`)
      }
    }
  })

  it("publishes the sign-in failure series at zero as well", async () => {
    const text = await metricsRegistry.metrics()

    for (const stage of ["password", "two_factor"]) {
      for (const role of ["admin", "other"]) {
        expect(text).toContain(`kinetix_identity_sign_in_failures_total{stage="${stage}",role="${role}"}`)
      }
    }
  })
})
