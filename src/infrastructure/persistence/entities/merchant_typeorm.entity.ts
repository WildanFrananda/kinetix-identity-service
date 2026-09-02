import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("merchants")
class MerchantTypeormEntity {
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

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

export default MerchantTypeormEntity
