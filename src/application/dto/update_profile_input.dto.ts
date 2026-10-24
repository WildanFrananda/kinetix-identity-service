import { IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from "class-validator"
import { isSent } from "./sent_value.validation"

class UpdateProfileInputDto {
  @ValidateIf(isSent)
  @IsString()
  @MaxLength(120)
  fullName?: string

  @ValidateIf(isSent)
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: "phoneNumber must be 8 to 15 digits, optionally after a +" })
  phoneNumber?: string

  @ValidateIf(isSent)
  @IsString()
  @MaxLength(255)
  streetAddress?: string

  @ValidateIf(isSent)
  @IsString()
  @MaxLength(100)
  city?: string

  @ValidateIf(isSent)
  @IsString()
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
