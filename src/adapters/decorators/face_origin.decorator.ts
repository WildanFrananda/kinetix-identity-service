import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import type { AuthenticatedRequest } from "../../types/request.type"

const FACE_ORIGIN_HEADER = "x-kinetix-origin"

function faceOriginOf(headers: AuthenticatedRequest["headers"]): string | null {
  const header = headers[FACE_ORIGIN_HEADER]
  if (header === undefined) {
    return null
  }

  return Array.isArray(header) ? header.join(", ") : header
}

const FaceOrigin = createParamDecorator(function (_data: unknown, context: ExecutionContext): string | null {
  const request = context.switchToHttp().getRequest<Pick<AuthenticatedRequest, "headers">>()

  return faceOriginOf(request.headers)
})

export { FACE_ORIGIN_HEADER, FaceOrigin, faceOriginOf }
