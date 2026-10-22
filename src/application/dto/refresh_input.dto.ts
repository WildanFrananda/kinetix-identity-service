import { IsNotEmpty, IsString, MaxLength } from "class-validator"

class RefreshInputDto {
  @IsString()
  @IsNotEmpty({ message: "refreshToken is required" })
  @MaxLength(4096)
  refreshToken!: string
}

export default RefreshInputDto
