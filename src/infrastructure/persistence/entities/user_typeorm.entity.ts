import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

@Entity("users")
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

  @Column({ nullable: true })
  twoFactorSecret?: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

export default UserTypeormEntity
