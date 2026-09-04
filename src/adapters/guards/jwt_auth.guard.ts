import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import TokenService from "../../application/services/token.service"
import type { AuthenticatedRequest } from "../../types/request.type"
import { IS_PUBLIC_KEY } from "../decorators/auth.decorators"

@Injectable()
class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") {
      return true
    }

    const isPublic: boolean =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]) ?? false
    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    const header = request.headers["authorization"] ?? request.headers["Authorization"]
    const raw: string = Array.isArray(header) ? (header[0] ?? "") : (header ?? "")

    const parts: string[] = raw.split(" ")
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || parts[1].length === 0) {
      throw new UnauthorizedException("A Bearer token is required")
    }

    request.user = await this.tokenService.verifyAccess(parts[1])
    return true
  }
}

export default JwtAuthGuard
