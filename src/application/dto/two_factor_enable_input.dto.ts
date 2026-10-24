import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from "class-validator"
import { isSent } from "./sent_value.validation"

class TwoFactorEnableInputDto {
  @IsString()
  @IsNotEmpty({ message: "code is required" })
  @Matches(/^\s*\d{6}\s*$/, { message: "code must be six digits" })
  code!: string

  @ValidateIf(isSent)
  @IsString()
  @IsNotEmpty({ message: "password must not be empty when it is sent" })
  @MaxLength(1024)
  password?: string
}

export default TwoFactorEnableInputDto
