import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator"

class RegisterUserInputDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string
}

export default RegisterUserInputDto
