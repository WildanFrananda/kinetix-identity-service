import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("passkey_challenges")
@Unique("UQ_passkey_challenges_mfa_jti", ["mfaJti"])
@Index("ix_passkey_challenges_expires", ["expiresAt"])
@Check("CK_passkey_challenges_purpose", `"purpose" IN ('register', 'sign_in')`)
@Check("CK_passkey_challenges_mfa_jti", `("purpose" = 'sign_in') = ("mfaJti" IS NOT NULL)`)
class PasskeyChallengeTypeormEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "PK_passkey_challenges" })
  id!: string

  @Column({ type: "integer" })
  userId!: number

  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_passkey_challenges_user" })
  user?: UserTypeormEntity

  @Column({ type: "varchar", length: 16 })
  purpose!: "register" | "sign_in"

  @Column({ type: "text" })
  challenge!: string

  @Column({ type: "uuid", nullable: true })
  mfaJti!: string | null

  @Column({ type: "timestamptz" })
  expiresAt!: Date

  @Column({ type: "timestamptz", nullable: true })
  usedAt!: Date | null
}

export default PasskeyChallengeTypeormEntity
