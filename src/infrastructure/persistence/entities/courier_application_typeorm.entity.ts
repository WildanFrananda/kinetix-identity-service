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
@Unique("UQ_courier_applications_vehicle_plate", ["vehiclePlate"])
@Check("CK_courier_applications_status", `"status" IN ('pending', 'approved', 'rejected')`)
@Check("CK_courier_applications_capacity", `"capacityKg" >= 0 AND "capacityKg" <= 5000`)
@Check(
  "CK_courier_applications_vehicle_plate",
  `"vehiclePlate" IS NULL OR btrim("vehiclePlate") <> ''`
)
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

  @Column({ type: "varchar", length: 32, nullable: true })
  vehiclePlate!: string | null

  @Column({ type: "integer", default: 0 })
  capacityKg!: number

  @Column({ type: "varchar", length: 16, default: "pending" })
  status!: "pending" | "approved" | "rejected"

  @CreateDateColumn({ type: "timestamptz" })
  filedAt!: Date

  @Column({ type: "timestamptz", nullable: true })
  approvedAt!: Date | null

  @Column({ type: "timestamptz", nullable: true })
  rejectedAt!: Date | null
}

export default CourierApplicationTypeormEntity
