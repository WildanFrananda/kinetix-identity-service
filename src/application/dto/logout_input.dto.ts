import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator"

class LogoutInputDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "refreshToken must not be empty when it is sent" })
  @MaxLength(4096)
  refreshToken?: string
}

export default LogoutInputDto
