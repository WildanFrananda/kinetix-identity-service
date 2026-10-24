import ExpiredRecordSweeperService from "../src/application/services/expired_record_sweeper.service"

describe("the expired record sweeper", () => {
  it("sweeps sign-in attempts and expired revocations", async () => {
    const attempts = { sweep: jest.fn().mockResolvedValue(3) }
    const tokens = { sweepExpiredRevocations: jest.fn().mockResolvedValue(2) }
    const sweeper = new ExpiredRecordSweeperService(attempts as any, tokens as any)

    await sweeper.sweep()

    expect(attempts.sweep).toHaveBeenCalled()
    expect(tokens.sweepExpiredRevocations).toHaveBeenCalled()
  })

  it("survives a database that cannot be reached, so the next sweep can try", async () => {
    const attempts = { sweep: jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432")) }
    const tokens = { sweepExpiredRevocations: jest.fn() }
    const sweeper = new ExpiredRecordSweeperService(attempts as any, tokens as any)

    await expect(sweeper.sweep()).resolves.toBeUndefined()
  })

  it("does not hold the process open, and stops when the module is destroyed", () => {
    jest.useFakeTimers()
    const attempts = { sweep: jest.fn().mockResolvedValue(0) }
    const tokens = { sweepExpiredRevocations: jest.fn().mockResolvedValue(0) }
    const sweeper = new ExpiredRecordSweeperService(attempts as any, tokens as any)

    sweeper.onApplicationBootstrap()
    jest.advanceTimersByTime(10 * 60 * 1000)
    sweeper.onModuleDestroy()
    jest.advanceTimersByTime(30 * 60 * 1000)
    jest.useRealTimers()

    expect(attempts.sweep).toHaveBeenCalledTimes(1)
  })
})
