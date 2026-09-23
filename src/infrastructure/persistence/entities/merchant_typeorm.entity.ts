import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("merchants")
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

  @Column({ nullable: true })
  description?: string

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
  latitude?: number

  @Column({ type: "double precision", nullable: true })
  longitude?: number

  @Column({ type: "timestamptz", nullable: true })
  geocodedAt?: Date

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn({ precision: 3 })
  updatedAt!: Date
}

export default MerchantTypeormEntity
