import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { IsNull, LessThan, Repository } from "typeorm"
import { randomUUID } from "crypto"
import * as jwt from "jsonwebtoken"
import JwtKeyProvider from "../../infrastructure/crypto/jwt_key_provider"
import RefreshTokenTypeormEntity from "../../infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "../../infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import type { AccessClaims, RefreshClaims, TokenPair, TokenSubject } from "../../types/token.type"
import type { JwksDocument } from "../../types/jwks.type"
import type { MfaChallengeClaims } from "../../types/two_factor.type"

@Injectable()
class TokenService {
  private readonly issuer: string
  private readonly audience: string
  private readonly accessTtlSeconds: number
  private readonly refreshTtlSeconds: number

  constructor(
    private readonly config: ConfigService,
    private readonly keys: JwtKeyProvider,
    @InjectRepository(RefreshTokenTypeormEntity)
    private readonly refreshRepository: Repository<RefreshTokenTypeormEntity>,
    @InjectRepository(RevokedAccessTokenTypeormEntity)
    private readonly revokedRepository: Repository<RevokedAccessTokenTypeormEntity>
  ) {
    const issuer = this.config.get<string>("JWT_ISSUER") ?? process.env.JWT_ISSUER
    const audience = this.config.get<string>("JWT_AUDIENCE") ?? process.env.JWT_AUDIENCE
    if (!issuer) {
      throw new Error("JWT_ISSUER is required and has no default.")
    }
    if (!audience) {
      throw new Error("JWT_AUDIENCE is required and has no default.")
    }
    this.issuer = issuer
    this.audience = audience

    this.accessTtlSeconds = Number(this.config.get<string>("JWT_ACCESS_TTL_SECONDS") ?? 900)
    this.refreshTtlSeconds = Number(this.config.get<string>("JWT_REFRESH_TTL_SECONDS") ?? 2592000)

    if (!Number.isFinite(this.accessTtlSeconds) || this.accessTtlSeconds <= 0) {
      throw new Error("JWT_ACCESS_TTL_SECONDS must be a positive number of seconds.")
    }
    if (!Number.isFinite(this.refreshTtlSeconds) || this.refreshTtlSeconds <= this.accessTtlSeconds) {
      throw new Error("JWT_REFRESH_TTL_SECONDS must be a positive number greater than the access TTL.")
    }
  }

  get jwksDocument(): JwksDocument {
    return this.keys.jwks()
  }

  async issuePair(user: TokenSubject, principalId: string): Promise<TokenPair> {
    return this.mintPair(user, principalId, randomUUID())
  }

  private async mintPair(user: TokenSubject, principalId: string, familyId: string): Promise<TokenPair> {
    const now: number = Math.floor(Date.now() / 1000)
    const accessJti: string = randomUUID()
    const refreshJti: string = randomUUID()

    const accessToken: string = jwt.sign(
      {
        sub: principalId,
        jti: accessJti,
        iss: this.issuer,
        aud: this.audience,
        iat: now,
        exp: now + this.accessTtlSeconds,
        token_use: "access",
        uid: user.id,
        email: user.email,
        role: user.role
      },
      this.keys.privateKey,
      { algorithm: "RS256", keyid: this.keys.kid }
    )

    const refreshExpiresAt = new Date((now + this.refreshTtlSeconds) * 1000)
    const refreshToken: string = jwt.sign(
      {
        sub: principalId,
        jti: refreshJti,
        iss: this.issuer,
        aud: this.audience,
        iat: now,
        exp: now + this.refreshTtlSeconds,
        token_use: "refresh",
        fam: familyId,
        uid: user.id
      },
      this.keys.privateKey,
      { algorithm: "RS256", keyid: this.keys.kid }
    )

    await this.refreshRepository.save(
      this.refreshRepository.create({
        jti: refreshJti,
        familyId,
        principalId,
        userId: user.id,
        expiresAt: refreshExpiresAt
      })
    )

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds }
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const claims = this.verifySignature(token)

    if (claims.token_use !== "access") {
      throw new UnauthorizedException("This is not an access token")
    }

    const revoked = await this.revokedRepository.findOne({ where: { jti: String(claims.jti) } })
    if (revoked) {
      throw new UnauthorizedException("This token has been revoked")
    }

    return claims as unknown as AccessClaims
  }

  issueMfaChallenge(user: TokenSubject, principalId: string): { token: string; expiresIn: number } {
    const now: number = Math.floor(Date.now() / 1000)
    const ttl = 300
    const token: string = jwt.sign(
      {
        sub: principalId,
        jti: randomUUID(),
        iss: this.issuer,
        aud: this.audience,
        iat: now,
        exp: now + ttl,
        token_use: "mfa_challenge",
        uid: user.id
      },
      this.keys.privateKey,
      { algorithm: "RS256", keyid: this.keys.kid }
    )
    return { token, expiresIn: ttl }
  }

  peekMfaChallenge(token: string): MfaChallengeClaims {
    const claims = this.verifySignature(token)
    if (claims.token_use !== "mfa_challenge") {
      throw new UnauthorizedException("This is not a two-factor challenge")
    }
    return claims as unknown as MfaChallengeClaims
  }

  peekRefresh(token: string): RefreshClaims {
    const claims = this.verifySignature(token)
    if (claims.token_use !== "refresh") {
      throw new UnauthorizedException("This is not a refresh token")
    }
    return claims as unknown as RefreshClaims
  }

  async rotate(refreshToken: string, user: TokenSubject): Promise<TokenPair> {
    const claims = this.verifySignature(refreshToken)

    if (claims.token_use !== "refresh") {
      throw new UnauthorizedException("This is not a refresh token")
    }

    const stored = await this.refreshRepository.findOne({ where: { jti: String(claims.jti) } })
    if (!stored) {
      throw new UnauthorizedException("This refresh token is not recognised")
    }

    if (stored.revokedAt) {
      throw new UnauthorizedException("This refresh token has been revoked")
    }

    if (stored.usedAt) {
      await this.revokeFamily(stored.familyId, "rotation_reuse")
      throw new UnauthorizedException("This refresh token has already been used; the session has been revoked")
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("This refresh token has expired")
    }

    const pair = await this.mintPair(user, stored.principalId, stored.familyId)

    const replacement = this.decodeWithoutVerifying(pair.refreshToken)
    stored.usedAt = new Date()
    stored.replacedByJti = replacement?.jti ? String(replacement.jti) : null
    await this.refreshRepository.save(stored)

    return pair
  }

  async logout(accessClaims: AccessClaims, refreshFamilyId?: string): Promise<void> {
    await this.revokeAccessJti(accessClaims.jti, new Date(accessClaims.exp * 1000), "logout")
    if (refreshFamilyId) {
      await this.revokeFamily(refreshFamilyId, "logout")
    } else {
      await this.revokeAllFamiliesForPrincipal(accessClaims.sub, "logout")
    }
  }

  async revokeAccessJti(jti: string, expiresAt: Date, reason: string): Promise<void> {
    try {
      await this.revokedRepository.save(this.revokedRepository.create({ jti, expiresAt, reason }))
    } catch {
      // already revoked
    }
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.refreshRepository.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason }
    )
  }

  async revokeAllFamiliesForPrincipal(principalId: string, reason: string): Promise<void> {
    await this.refreshRepository.update(
      { principalId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason }
    )
  }

  async sweepExpiredRevocations(): Promise<number> {
    const result = await this.revokedRepository.delete({ expiresAt: LessThan(new Date()) })
    return result.affected ?? 0
  }

  private verifySignature(token: string): jwt.JwtPayload {
    try {
      const claims = jwt.verify(token, this.keys.publicKey, {
        algorithms: ["RS256"],
        issuer: this.issuer,
        audience: this.audience
      })
      if (typeof claims === "string") {
        throw new UnauthorizedException("Token payload is not an object")
      }
      return claims
    } catch (cause) {
      if (cause instanceof UnauthorizedException) {
        throw cause
      }
      throw new UnauthorizedException("Invalid token")
    }
  }

  private decodeWithoutVerifying(token: string): jwt.JwtPayload | null {
    const decoded = jwt.decode(token)
    return decoded && typeof decoded !== "string" ? decoded : null
  }
}

export default TokenService
