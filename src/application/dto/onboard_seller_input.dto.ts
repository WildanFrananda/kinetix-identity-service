import { IsNotEmpty, IsString } from "class-validator"

class OnboardSellerInputDto {
  @IsString()
  @IsNotEmpty()
  storeName!: string

  @IsString()
  @IsNotEmpty()
  businessRegistrationNumber!: string

  @IsString()
  @IsNotEmpty()
  taxId!: string

  @IsString()
  @IsNotEmpty()
  streetAddress!: string

  @IsString()
  @IsNotEmpty()
  city!: string

  @IsString()
  @IsNotEmpty()
  postalCode!: string
}

export default OnboardSellerInputDto
