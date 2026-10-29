import { IsObject, IsString, IsUUID, Matches, MaxLength } from "class-validator"
import { LONGEST_PASSKEY_NAME } from "../../domain/passkey_policy"

class PasskeyRegistrationInputDto {
  @IsUUID("all", { message: "challengeId must be the id the options answered" })
  challengeId!: string

  @IsString()
  @Matches(/\S/u, { message: "name must not be blank" })
  @MaxLength(LONGEST_PASSKEY_NAME)
  name!: string

  @IsObject({ message: "credential must be the object the browser's create() returned, as JSON" })
  credential!: Record<string, unknown>
}

export default PasskeyRegistrationInputDto
