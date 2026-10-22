import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator"

class LoginInputDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(1024)
  password!: string
}

export default LoginInputDto
