import { IsISO8601, IsNotEmpty, IsString, Matches } from "class-validator"

class ApplicationTallyQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, {
    message: "since must be an instant with its offset, such as 2026-10-29T00:00:00+07:00"
  })
  @IsISO8601({ strict: true, strictSeparator: true }, { message: "since must be a date and time that exist" })
  since!: string
}

export default ApplicationTallyQueryDto
