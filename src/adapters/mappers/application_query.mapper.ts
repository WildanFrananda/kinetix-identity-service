import type { ApplicationQuery } from "../../types/application.type"

const APPLICATION_PAGE_SIZE = 50

function applicationQueryOf<S>(filter: { status?: S; limit?: number; after?: number }): ApplicationQuery<S> {
  return {
    status: filter.status ?? null,
    afterId: filter.after ?? 0,
    limit: filter.limit ?? APPLICATION_PAGE_SIZE
  }
}

export { applicationQueryOf }
