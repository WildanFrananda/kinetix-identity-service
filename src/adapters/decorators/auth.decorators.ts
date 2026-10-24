import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common"
import type { AccessClaims, SessionClaims } from "../../types/token.type"
import type { AuthenticatedRequest } from "../../types/request.type"

const IS_PUBLIC_KEY = "kinetix:isPublic"
const ROLES_KEY = "kinetix:roles"
const ACCEPTS_ENROLMENT_KEY = "kinetix:acceptsEnrolment"

const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)

function AcceptsEnrolment(): MethodDecorator {
  return SetMetadata(ACCEPTS_ENROLMENT_KEY, true)
}

const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AccessClaims => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
  if (!request.user) {
    throw new Error("CurrentUser was requested on a route that carries no verified token")
  }
  if (request.user.token_use !== "access") {
    throw new Error("CurrentUser was requested on a route that let a two-factor enrolment token through")
  }
  return request.user
})

const CurrentSession = createParamDecorator(function (_data: unknown, context: ExecutionContext): SessionClaims {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
  if (!request.user) {
    throw new Error("CurrentSession was requested on a route that carries no verified token")
  }
  return request.user
})

export {
  ACCEPTS_ENROLMENT_KEY,
  AcceptsEnrolment,
  CurrentSession,
  CurrentUser,
  IS_PUBLIC_KEY,
  Public,
  Roles,
  ROLES_KEY
}
