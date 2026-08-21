import { IsOptional, IsString } from "class-validator"

class UpdateProfileInputDto {
  @IsString()
  @IsOptional()
  fullName?: string

  @IsString()
  @IsOptional()
  phoneNumber?: string

  @IsString()
  @IsOptional()
  streetAddress?: string

  @IsString()
  @IsOptional()
  city?: string

  @IsString()
  @IsOptional()
  postalCode?: string

  @IsString()
  @IsOptional()
  avatarUrl?: string
}

export default UpdateProfileInputDto
