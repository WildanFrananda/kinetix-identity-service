import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity("account_sign_in_attempts")
@Index("ix_account_sign_in_attempts_last_attempt", ["lastAttemptAt"])
class AccountSignInAttemptTypeormEntity {
  @PrimaryColumn({ type: "varchar", length: 64, primaryKeyConstraintName: "PK_account_sign_in_attempts" })
  accountKey!: string

  @Column({ type: "integer" })
  attempts!: number

  @Column({ type: "timestamptz" })
  lastAttemptAt!: Date

  @Column({ type: "timestamptz" })
  delayedUntil!: Date
}

export default AccountSignInAttemptTypeormEntity
