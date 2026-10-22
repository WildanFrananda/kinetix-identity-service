import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator"

class TwoFactorVerifyInputDto {
  @IsString()
  @IsNotEmpty({ message: "challengeToken is required" })
  @MaxLength(4096)
  challengeToken!: string

  @IsString()
  @IsNotEmpty({ message: "code is required" })
  @Matches(/^\s*\d{6}\s*$/, { message: "code must be six digits" })
  code!: string
}

export default TwoFactorVerifyInputDto
