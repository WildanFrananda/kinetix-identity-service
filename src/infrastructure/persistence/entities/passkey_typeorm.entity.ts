import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("passkeys")
@Unique("UQ_passkeys_credential_id", ["credentialId"])
@Index("ix_passkeys_user", ["userId"])
@Check("CK_passkeys_device_type", `"deviceType" IN ('singleDevice', 'multiDevice')`)
class PasskeyTypeormEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "PK_passkeys" })
  id!: string

  @Column({ type: "integer" })
  userId!: number

  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_passkeys_user" })
  user?: UserTypeormEntity

  @Column({ type: "text" })
  credentialId!: string

  @Column({ type: "bytea" })
  publicKey!: Buffer

  @Column({ type: "bigint" })
  signCount!: string

  @Column({ type: "text", array: true })
  transports!: string[]

  @Column({ type: "varchar", length: 32 })
  deviceType!: "singleDevice" | "multiDevice"

  @Column({ type: "boolean" })
  backedUp!: boolean

  @Column({ type: "varchar", length: 64 })
  name!: string

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt!: Date | null
}

export default PasskeyTypeormEntity
