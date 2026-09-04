import type { PrincipalKind } from "../../src/types/principal.type"

type BackfillSource = {
  service: string
  table: string
  column: string
  kind: PrincipalKind
}

type BackfillOrphan = {
  service: string
  table: string
  column: string
  localId: string
  kind: PrincipalKind
}

type BackfillKindMismatch = {
  service: string
  table: string
  column: string
  localId: string
  expected: PrincipalKind
  actual: string
}

export type { BackfillKindMismatch, BackfillOrphan, BackfillSource }
