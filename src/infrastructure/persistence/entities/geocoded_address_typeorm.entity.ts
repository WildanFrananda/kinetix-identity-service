import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"

@Entity("geocoded_addresses")
@Index("UQ_geocoded_addresses_query", ["query"], { unique: true })
@Check(
  "CK_geocoded_addresses_on_earth",
  '"latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180'
)
class GeocodedAddressTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: "text" })
  query!: string

  @Column({ type: "double precision" })
  latitude!: number

  @Column({ type: "double precision" })
  longitude!: number

  @Column()
  provider!: string

  @Column({ default: "UNSPECIFIED" })
  precision!: string

  @Column({ type: "text", nullable: true })
  displayName?: string

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date
}

export default GeocodedAddressTypeormEntity
