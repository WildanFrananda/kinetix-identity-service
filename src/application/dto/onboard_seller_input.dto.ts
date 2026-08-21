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
}

export default OnboardSellerInputDto
