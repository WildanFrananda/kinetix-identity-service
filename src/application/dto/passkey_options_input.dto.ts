import { IsNotEmpty, IsString, MaxLength } from "class-validator"

class PasskeyOptionsInputDto {
  @IsString()
  @IsNotEmpty({ message: "challengeToken is required" })
  @MaxLength(4096)
  challengeToken!: string
}

export default PasskeyOptionsInputDto
