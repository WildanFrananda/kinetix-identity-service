import { IsEmail, IsInt, IsNotEmpty, IsString, Max, Min, MinLength } from "class-validator"

class RegisterCourierInputDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  password!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullName!: string

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string

  @IsString()
  @IsNotEmpty()
  vehiclePlate!: string

  @IsInt()
  @Min(1)
  @Max(5000)
  capacityKg!: number
}

export default RegisterCourierInputDto
