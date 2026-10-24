import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity("two_factor_challenge_attempts")
@Index("ix_two_factor_challenge_attempts_expires", ["expiresAt"])
class TwoFactorChallengeAttemptTypeormEntity {
  @PrimaryColumn({ type: "uuid", primaryKeyConstraintName: "PK_two_factor_challenge_attempts" })
  jti!: string

  @Column({ type: "integer" })
  attempts!: number

  @Column({ type: "timestamptz" })
  expiresAt!: Date
}

export default TwoFactorChallengeAttemptTypeormEntity
