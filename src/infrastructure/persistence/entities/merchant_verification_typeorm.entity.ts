import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("merchant_verifications")
class MerchantVerificationTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

  // The relation is declared, not just the column. Without it the entity described a schema
  // with no foreign key while the database had one, so `migration:generate` proposed dropping
  // and re-adding all three on every run — a drift check built on that would fail forever on a
  // difference that is not one.
  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId" })
  user?: UserTypeormEntity

  @Column()
  storeName!: string

  @Column()
  businessRegistrationNumber!: string

  @Column()
  taxId!: string

  @Column({ default: "pending" })
  status!: "pending" | "verified" | "rejected"

  @Column({ nullable: true })
  verifiedAt?: Date
}

export default MerchantVerificationTypeormEntity
