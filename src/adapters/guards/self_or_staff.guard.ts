import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { AuthenticatedRequest } from "../../types/request.type"

const SELF_PARAM_KEY = "kinetix:selfParam"
const OWNER_ONLY_KEY = "kinetix:ownerOnly"

const SelfParam = (param: string) => SetMetadata(SELF_PARAM_KEY, param)

const OwnerParam = (param: string) =>
  applyDecorators(SetMetadata(SELF_PARAM_KEY, param), SetMetadata(OWNER_ONLY_KEY, true))

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

    const ownerOnly: boolean = this.reflector.get<boolean>(OWNER_ONLY_KEY, context.getHandler()) ?? false
    if (claims.role === "admin" && !ownerOnly) {
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
export { OWNER_ONLY_KEY, OwnerParam, SELF_PARAM_KEY, SelfParam }
