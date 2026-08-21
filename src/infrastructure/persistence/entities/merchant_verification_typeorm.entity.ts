import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

@Entity("merchant_verifications")
class MerchantVerificationTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

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
