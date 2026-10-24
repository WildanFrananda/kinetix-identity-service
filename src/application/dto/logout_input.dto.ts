import { IsNotEmpty, IsString, MaxLength, ValidateIf } from "class-validator"
import { isSent } from "./sent_value.validation"

class LogoutInputDto {
  @ValidateIf(isSent)
  @IsString()
  @IsNotEmpty({ message: "refreshToken must not be empty when it is sent" })
  @MaxLength(4096)
  refreshToken?: string
}

export default LogoutInputDto
