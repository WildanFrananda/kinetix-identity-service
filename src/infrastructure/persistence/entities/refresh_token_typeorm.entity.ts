import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm"

@Entity("refresh_tokens")
@Index("ix_refresh_tokens_family", ["familyId"])
@Index("ix_refresh_tokens_principal", ["principalId"])
class RefreshTokenTypeormEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ type: "uuid", unique: true })
  jti!: string

  @Column({ type: "uuid" })
  familyId!: string

  @Column({ type: "uuid" })
  principalId!: string

  @Column({ type: "int" })
  userId!: number

  @Column({ type: "timestamptz" })
  expiresAt!: Date

  @Column({ type: "timestamptz", nullable: true })
  usedAt?: Date | null

  @Column({ type: "timestamptz", nullable: true })
  revokedAt?: Date | null

  @Column({ type: "varchar", length: 32, nullable: true })
  revokedReason?: string | null

  @Column({ type: "uuid", nullable: true })
  replacedByJti?: string | null

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date
}

export default RefreshTokenTypeormEntity
