import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("merchants")
@Check(
  "CK_merchants_point_on_earth",
  '("latitude" IS NULL AND "longitude" IS NULL) ' +
    'OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)'
)
class MerchantTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId" })
  user?: UserTypeormEntity

  @Column()
  storeName!: string

  @Column({ unique: true })
  slug!: string

  @Column({ type: "varchar", nullable: true })
  description?: string | null

  @Column()
  businessRegistrationNumber!: string

  @Column()
  taxId!: string

  @Column({ default: "pending" })
  status!: "pending" | "verified" | "active" | "suspended"

  @Column({ nullable: true })
  verifiedAt?: Date

  @Column({ default: "" })
  streetAddress!: string

  @Column({ default: "" })
  city!: string

  @Column({ default: "" })
  postalCode!: string

  @Column({ type: "double precision", nullable: true })
  latitude?: number | null

  @Column({ type: "double precision", nullable: true })
  longitude?: number | null

  @Column({ type: "timestamptz", nullable: true })
  geocodedAt?: Date | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn({ precision: 3 })
  updatedAt!: Date
}

export default MerchantTypeormEntity
