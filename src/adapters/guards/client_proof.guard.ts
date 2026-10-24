import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import ClientGateService from "../../application/services/client_gate.service"
import type { AuthenticatedRequest } from "../../types/request.type"
import { requestIdOf } from "../decorators/request_context.decorator"

@Injectable()
class ClientProofGuard implements CanActivate {
  constructor(private readonly gate: ClientGateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    request.kinetixClient = await this.gate.admit(request.headers, requestIdOf(request.headers))

    return true
  }
}

export default ClientProofGuard
