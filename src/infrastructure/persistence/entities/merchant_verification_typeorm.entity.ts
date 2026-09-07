import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("merchant_verifications")
class MerchantVerificationTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

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
