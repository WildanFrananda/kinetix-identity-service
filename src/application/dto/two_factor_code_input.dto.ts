import { IsNotEmpty, IsString, Matches } from "class-validator"

class TwoFactorCodeInputDto {
  @IsString()
  @IsNotEmpty({ message: "code is required" })
  @Matches(/^\s*\d{6}\s*$/, { message: "code must be six digits" })
  code!: string
}

export default TwoFactorCodeInputDto
