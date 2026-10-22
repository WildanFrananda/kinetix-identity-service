import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm"

import PrincipalTypeormEntity from "./principal_typeorm.entity"
import UserTypeormEntity from "./user_typeorm.entity"

@Entity("courier_applications")
@Unique("UQ_courier_applications_user", ["userId"])
@Check("CK_courier_applications_status", `"status" IN ('pending', 'approved')`)
class CourierApplicationTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: "integer" })
  userId!: number

  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_courier_applications_user" })
  user?: UserTypeormEntity

  @Column({ type: "uuid" })
  principalId!: string

  @ManyToOne(() => PrincipalTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "principalId", foreignKeyConstraintName: "FK_courier_applications_principal" })
  principal?: PrincipalTypeormEntity

  @Column({ type: "bigint", nullable: true })
  driverId!: string | null

  @Column({ type: "varchar", length: 16, default: "pending" })
  status!: "pending" | "approved"

  @CreateDateColumn({ type: "timestamptz" })
  filedAt!: Date

  @Column({ type: "timestamptz", nullable: true })
  approvedAt!: Date | null
}

export default CourierApplicationTypeormEntity
