import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import GeocodedAddressRepositoryPort from "../../../domain/ports/geocoded_address_repository.port"
import type { GeocodePrecision, ProviderPoint } from "../../../types/geo.type"
import GeocodedAddressTypeormEntity from "../entities/geocoded_address_typeorm.entity"

const PRECISIONS: readonly GeocodePrecision[] = [
  "UNSPECIFIED",
  "ROOFTOP",
  "STREET",
  "SUBURB",
  "CITY"
]

@Injectable()
class TypeormGeocodedAddressRepositoryAdapter implements GeocodedAddressRepositoryPort {
  constructor(
    @InjectRepository(GeocodedAddressTypeormEntity)
    private readonly repo: Repository<GeocodedAddressTypeormEntity>
  ) {}

  async findByQuery(query: string): Promise<ProviderPoint | null> {
    const record = await this.repo.findOne({ where: { query } })
    if (!record) return null

    return {
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      precision: this.precisionOf(record.precision),
      displayName: record.displayName
    }
  }

  async remember(query: string, provider: string, point: ProviderPoint): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(GeocodedAddressTypeormEntity)
      .values({
        query,
        latitude: point.latitude,
        longitude: point.longitude,
        provider,
        precision: point.precision,
        displayName: point.displayName
      })
      .orIgnore()
      .execute()
  }

  async forget(query: string): Promise<void> {
    await this.repo.delete({ query })
  }

  private precisionOf(stored: string): GeocodePrecision {
    const found = PRECISIONS.find((candidate) => candidate === stored)
    return found ?? "UNSPECIFIED"
  }
}

export default TypeormGeocodedAddressRepositoryAdapter
