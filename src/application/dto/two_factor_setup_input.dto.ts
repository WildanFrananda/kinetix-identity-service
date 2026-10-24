import { IsNotEmpty, IsString, MaxLength, ValidateIf } from "class-validator"
import { isSent } from "./sent_value.validation"

class TwoFactorSetupInputDto {
  @ValidateIf(isSent)
  @IsString()
  @IsNotEmpty({ message: "password must not be empty when it is sent" })
  @MaxLength(1024)
  password?: string
}

export default TwoFactorSetupInputDto
