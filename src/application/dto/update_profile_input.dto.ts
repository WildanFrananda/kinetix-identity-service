import { IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator"
import { isSent } from "./sent_value.validation"

function hasCoordinates(dto: UpdateProfileInputDto): boolean {
  return dto.latitude !== undefined || dto.longitude !== undefined
}

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

  @ValidateIf(hasCoordinates)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: "latitude must be a number when coordinates are sent" }
  )
  @Min(-90)
  @Max(90)
  latitude?: number

  @ValidateIf(hasCoordinates)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: "longitude must be a number when coordinates are sent" }
  )
  @Min(-180)
  @Max(180)
  longitude?: number
}

export default UpdateProfileInputDto
