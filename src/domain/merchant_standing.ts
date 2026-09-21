const MAY_SELL: ReadonlyArray<string> = ["verified", "active"]

function maySell(status: string): boolean {
  return MAY_SELL.includes(status)
}

export { MAY_SELL, maySell }
