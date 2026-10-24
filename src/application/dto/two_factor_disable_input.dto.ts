import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator"

class TwoFactorDisableInputDto {
  @IsString()
  @IsNotEmpty({ message: "code is required" })
  @Matches(/^\s*\d{6}\s*$/, { message: "code must be six digits" })
  code!: string

  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MaxLength(1024)
  password!: string
}

export default TwoFactorDisableInputDto
