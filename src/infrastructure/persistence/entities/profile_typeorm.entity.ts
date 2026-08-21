import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

@Entity("profiles")
class ProfileTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  userId!: number

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
}

export default ProfileTypeormEntity
