import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { AuthenticatedRequest } from "../../types/request.type"

const SELF_PARAM_KEY = "kinetix:selfParam"

const SelfParam = (param: string) => SetMetadata(SELF_PARAM_KEY, param)

@Injectable()
class SelfOrStaffGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true
    }

    const param: string | undefined = this.reflector.get<string>(SELF_PARAM_KEY, context.getHandler())
    if (!param) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    const claims = request.user
    if (!claims) {
      throw new ForbiddenException("This route requires a verified caller")
    }

    if (claims.role === "admin") {
      return true
    }

    const requested: string = request.params?.[param] ?? ""
    if (requested !== String(claims.uid)) {
      throw new ForbiddenException("This account may only act on its own resources")
    }

    return true
  }
}

export default SelfOrStaffGuard
export { SELF_PARAM_KEY, SelfParam }
