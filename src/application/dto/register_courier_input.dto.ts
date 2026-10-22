import {
  IsByteLength,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator"

class RegisterCourierInputDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @IsByteLength(0, 72, { message: "password must be at most 72 bytes, which is all bcrypt reads" })
  password!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: "phoneNumber must be 8 to 15 digits, optionally after a +" })
  phoneNumber!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  vehiclePlate!: string

  @IsInt()
  @Min(1)
  @Max(5000)
  capacityKg!: number
}

export default RegisterCourierInputDto
