import { Transform } from "class-transformer"
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator"
import type { CourierApplicationStatus } from "../../types/application.type"
import { decimalInteger } from "./decimal_integer.transform"

class ListCourierApplicationsQueryDto {
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  status?: CourierApplicationStatus

  @IsOptional()
  @Transform(decimalInteger)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number

  @IsOptional()
  @Transform(decimalInteger)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  after?: number
}

export default ListCourierApplicationsQueryDto
