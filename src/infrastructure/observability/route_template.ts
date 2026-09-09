const UNMATCHED_ROUTE = "unmatched"

const PARAMETER = /:([A-Za-z0-9_]+)/g

function routeTemplateOf(matched: string | undefined): string {
  if (matched === undefined || matched === "") {
    return UNMATCHED_ROUTE
  }

  return matched.replace(PARAMETER, "{$1}")
}

export { routeTemplateOf, UNMATCHED_ROUTE }
