import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm"

@Entity("revoked_access_tokens")
@Index("ix_revoked_access_tokens_expires", ["expiresAt"])
class RevokedAccessTokenTypeormEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ type: "uuid", unique: true })
  jti!: string

  @Column({ type: "timestamptz" })
  expiresAt!: Date

  @Column({ type: "varchar", length: 32 })
  reason!: string

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date
}

export default RevokedAccessTokenTypeormEntity
