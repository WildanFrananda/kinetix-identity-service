import { IsOptional, IsString, IsUrl, Matches, MaxLength } from "class-validator"

class UpdateProfileInputDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string

  @IsString()
  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/, { message: "phoneNumber must be 8 to 15 digits, optionally after a +" })
  phoneNumber?: string

  @IsString()
  @IsOptional()
  @MaxLength(255)
  streetAddress?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string

  @IsString()
  @IsOptional()
  @MaxLength(16)
  postalCode?: string

  @IsOptional()
  @IsUrl(
    { protocols: ["https"], require_protocol: true, require_tld: true },
    { message: "avatarUrl must be an https URL" }
  )
  @MaxLength(2048)
  avatarUrl?: string
}

export default UpdateProfileInputDto
