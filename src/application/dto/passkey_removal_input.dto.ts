import { IsNotEmpty, IsString, MaxLength } from "class-validator"

class PasskeyRemovalInputDto {
  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MaxLength(1024)
  password!: string
}

export default PasskeyRemovalInputDto
