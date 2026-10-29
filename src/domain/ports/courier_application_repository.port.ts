import type {
  ApplicationPage,
  ApplicationTally,
  ApplicationQuery,
  CourierApplicationStatus,
  CourierApplicationView,
  CourierFiling
} from "../../types/application.type"

interface CourierApplicationRepositoryPort {
  recordFiled(filing: CourierFiling): Promise<void>
  recordApproved(filing: CourierFiling): Promise<void>
  recordRejected(userId: number): Promise<boolean>
  findByUser(userId: number): Promise<CourierApplicationView | null>
  list(query: ApplicationQuery<CourierApplicationStatus>): Promise<ApplicationPage<CourierApplicationView>>
  tally(since: Date): Promise<ApplicationTally>
}

export default CourierApplicationRepositoryPort
