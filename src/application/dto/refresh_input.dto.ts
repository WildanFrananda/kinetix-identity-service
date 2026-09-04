import { IsNotEmpty, IsString } from "class-validator"

class RefreshInputDto {
  @IsString()
  @IsNotEmpty({ message: "refreshToken is required" })
  refreshToken!: string
}

export default RefreshInputDto
