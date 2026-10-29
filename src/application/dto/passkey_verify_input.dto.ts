import { IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator"

class PasskeyVerifyInputDto {
  @IsString()
  @IsNotEmpty({ message: "challengeToken is required" })
  @MaxLength(4096)
  challengeToken!: string

  @IsObject({ message: "credential must be the object the browser's get() returned, as JSON" })
  credential!: Record<string, unknown>
}

export default PasskeyVerifyInputDto
