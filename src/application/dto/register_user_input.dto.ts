import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from "class-validator"

class RegisterUserInputDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string

  @IsEnum(["customer", "seller", "courier", "admin"])
  role!: "customer" | "seller" | "courier" | "admin"
}

export default RegisterUserInputDto
