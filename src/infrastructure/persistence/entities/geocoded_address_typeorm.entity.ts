import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

@Entity("geocoded_addresses")
class GeocodedAddressTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Index({ unique: true })
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
