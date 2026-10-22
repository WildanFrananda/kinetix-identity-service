import { IsByteLength, IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator"

class RegisterUserInputDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @IsByteLength(0, 72, { message: "password must be at most 72 bytes, which is all bcrypt reads" })
  password!: string
}

export default RegisterUserInputDto
