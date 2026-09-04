import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm"

import PrincipalTypeormEntity from "./principal_typeorm.entity"

@Entity("principal_aliases")
@Unique("uq_principal_aliases_service_local_id", ["service", "localId"])
@Index("ix_principal_aliases_service_local_id", ["service", "localId"])
class PrincipalAliasTypeormEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: "uuid" })
  principalId!: string

  @ManyToOne(() => PrincipalTypeormEntity, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "principalId" })
  principal?: PrincipalTypeormEntity

  @Column({ type: "varchar", length: 32 })
  service!: string

  @Column({ type: "varchar", length: 128 })
  localId!: string

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date
}

export default PrincipalAliasTypeormEntity
