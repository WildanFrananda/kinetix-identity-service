import { IsNotEmpty, IsString, MaxLength } from "class-validator"

class OnboardSellerInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  storeName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  businessRegistrationNumber!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  taxId!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  streetAddress!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  postalCode!: string
}

export default OnboardSellerInputDto
