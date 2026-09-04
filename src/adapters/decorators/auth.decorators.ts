import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common"
import type { AccessClaims } from "../../types/token.type"
import type { AuthenticatedRequest } from "../../types/request.type"

const IS_PUBLIC_KEY = "kinetix:isPublic"
const ROLES_KEY = "kinetix:roles"

const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)

const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AccessClaims => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
  if (!request.user) {
    throw new Error("CurrentUser was requested on a route that carries no verified token")
  }
  return request.user
})

export { CurrentUser, IS_PUBLIC_KEY, Public, Roles, ROLES_KEY }
