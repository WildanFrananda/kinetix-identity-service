import type {
  ApplicationPage,
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
}

export default CourierApplicationRepositoryPort
