import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { AuthenticatedRequest } from "../../types/request.type"
import { ROLES_KEY } from "../decorators/auth.decorators"

@Injectable()
class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true
    }

    const required: string[] | undefined = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!required || required.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const role: string | undefined = request.user?.role

    if (!role || !required.includes(role)) {
      throw new ForbiddenException("This account does not have access to this resource")
    }

    return true
  }
}

export default RolesGuard
