import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

@Entity("users")
@Index("UQ_users_email_lower", { synchronize: false })
class UserTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  email!: string

  @Column()
  passwordHash!: string

  @Column({ default: "customer" })
  role!: "customer" | "seller" | "courier" | "admin"

  @Column({ default: false })
  isTwoFactorEnabled!: boolean

  @Column({ type: "varchar", nullable: true })
  twoFactorSecret!: string | null

  @Column({ type: "integer", nullable: true })
  twoFactorLastStep!: number | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

export default UserTypeormEntity
