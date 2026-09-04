import { Controller, Get, Header, HttpCode, HttpStatus } from "@nestjs/common"
import TokenService from "../../application/services/token.service"
import { Public } from "../decorators/auth.decorators"
import type { JwksDocument } from "../../types/jwks.type"

@Controller()
class JwksController {
  constructor(private readonly tokenService: TokenService) {}

  @Public()
  @Get(".well-known/jwks.json")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "public, max-age=300")
  @Header("Content-Type", "application/jwk-set+json")
  jwks(): JwksDocument {
    return this.tokenService.jwksDocument
  }
}

export default JwksController
