import { ExecutionContext, ForbiddenException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import SelfOrStaffGuard, { OwnerParam, SelfParam } from "../src/adapters/guards/self_or_staff.guard"
import AuthController from "../src/adapters/controllers/auth.controller"

class Routes {
  @SelfParam("id")
  profile(): void {}

  @OwnerParam("id")
  secondFactor(): void {}
}

function contextFor(handler: () => void, role: string, uid: number, id: string): ExecutionContext {
  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role, uid, sub: "p-" + uid }, params: { id } })
    })
  } as unknown as ExecutionContext
}

describe("who may act on an account's resources", () => {
  const guard = new SelfOrStaffGuard(new Reflector())

  it("lets an admin act on someone else's profile", () => {
    expect(guard.canActivate(contextFor(Routes.prototype.profile, "admin", 1, "42"))).toBe(true)
  })

  it("refuses an admin on someone else's second factor", () => {
    expect(() => guard.canActivate(contextFor(Routes.prototype.secondFactor, "admin", 1, "42"))).toThrow(
      ForbiddenException
    )
  })

  it("lets an admin set up their own second factor", () => {
    expect(guard.canActivate(contextFor(Routes.prototype.secondFactor, "admin", 42, "42"))).toBe(true)
  })

  it("lets the owner act on their own second factor and nobody else's", () => {
    expect(guard.canActivate(contextFor(Routes.prototype.secondFactor, "customer", 42, "42"))).toBe(true)
    expect(() => guard.canActivate(contextFor(Routes.prototype.secondFactor, "customer", 7, "42"))).toThrow(
      ForbiddenException
    )
  })

  it.each(["setupTwoFactor", "enableTwoFactor", "disableTwoFactor"])(
    "marks %s as the owner's alone",
    (method) => {
      const handler = (AuthController.prototype as unknown as Record<string, () => void>)[method]
      expect(() => guard.canActivate(contextFor(handler, "admin", 1, "42"))).toThrow(ForbiddenException)
    }
  )
})
