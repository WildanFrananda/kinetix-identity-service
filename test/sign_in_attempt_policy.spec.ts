import {
  admitAttempt,
  delaySecondsAfter,
  FORGET_AFTER_SECONDS,
  LONGEST_DELAY_SECONDS
} from "../src/domain/sign_in_attempt_policy"

const NOW = new Date("2026-10-22T10:00:00.000Z")

function secondsFromNow(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000)
}

describe("the sign-in attempt policy", () => {
  it("admits a first attempt and counts it", () => {
    expect(admitAttempt(null, NOW)).toEqual({ admitted: true, attempts: 1, delayedUntil: NOW })
  })

  it("starts a delay at the fifth attempt and doubles it from one second", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(delaySecondsAfter)).toEqual([0, 0, 0, 0, 1, 2, 4, 8, 16, 32, 60])
  })

  it("never delays longer than a minute, however many attempts there were", () => {
    expect(delaySecondsAfter(2147483647)).toBe(LONGEST_DELAY_SECONDS)
    expect(LONGEST_DELAY_SECONDS).toBe(60)
  })

  it("refuses while a delay runs, rounding the wait up to whole seconds", () => {
    const state = { attempts: 6, lastAttemptAt: secondsFromNow(-0.5), delayedUntil: secondsFromNow(1.2) }

    expect(admitAttempt(state, NOW)).toEqual({ admitted: false, retryAfterSeconds: 2 })
  })

  it("admits once the delay has run and sets the next one", () => {
    const state = { attempts: 6, lastAttemptAt: secondsFromNow(-2), delayedUntil: NOW }

    expect(admitAttempt(state, NOW)).toEqual({ admitted: true, attempts: 7, delayedUntil: secondsFromNow(4) })
  })

  it("forgets an account that has had no attempt for an hour", () => {
    const state = {
      attempts: 40,
      lastAttemptAt: secondsFromNow(-FORGET_AFTER_SECONDS),
      delayedUntil: secondsFromNow(-FORGET_AFTER_SECONDS + 60)
    }

    expect(admitAttempt(state, NOW)).toEqual({ admitted: true, attempts: 1, delayedUntil: NOW })
  })
})
