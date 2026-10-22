import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm"

import UserTypeormEntity from "./user_typeorm.entity"

@Entity("profiles")
@Index("ix_profiles_created", ["createdAt"])
@Check(
  "CK_profiles_point_on_earth",
  '("latitude" IS NULL AND "longitude" IS NULL) ' +
    'OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)'
)
class ProfileTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

  @ManyToOne(() => UserTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId" })
  user?: UserTypeormEntity

  @Column({ default: "" })
  fullName!: string

  @Column({ default: "" })
  phoneNumber!: string

  @Column({ default: "" })
  streetAddress!: string

  @Column({ default: "" })
  city!: string

  @Column({ default: "" })
  postalCode!: string

  @Column({ nullable: true })
  avatarUrl?: string

  @Column({ type: "double precision", nullable: true })
  latitude?: number | null

  @Column({ type: "double precision", nullable: true })
  longitude?: number | null

  @Column({ type: "timestamptz", nullable: true })
  geocodedAt?: Date | null

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date
}

export default ProfileTypeormEntity
