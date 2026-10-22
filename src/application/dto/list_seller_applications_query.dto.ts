import { Transform } from "class-transformer"
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator"
import type { SellerApplicationStatus } from "../../types/application.type"
import { decimalInteger } from "./decimal_integer.transform"

class ListSellerApplicationsQueryDto {
  @IsOptional()
  @IsIn(["pending", "verified", "rejected"])
  status?: SellerApplicationStatus

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

export default ListSellerApplicationsQueryDto
