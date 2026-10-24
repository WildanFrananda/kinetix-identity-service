import type { AttemptAdmission, AttemptState } from "../types/sign_in_attempt.type"

const ATTEMPTS_BEFORE_DELAY = 5
const FIRST_DELAY_SECONDS = 1
const LONGEST_DELAY_SECONDS = 60
const FORGET_AFTER_SECONDS = 3600
const ATTEMPTS_PER_CHALLENGE = 5

function delaySecondsAfter(attempts: number): number {
  if (attempts < ATTEMPTS_BEFORE_DELAY) {
    return 0
  }

  const doublings = Math.min(attempts - ATTEMPTS_BEFORE_DELAY, 30)
  return Math.min(LONGEST_DELAY_SECONDS, FIRST_DELAY_SECONDS * 2 ** doublings)
}

function admitAttempt(state: AttemptState | null, now: Date): AttemptAdmission {
  if (state !== null && state.delayedUntil.getTime() > now.getTime()) {
    return {
      admitted: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.delayedUntil.getTime() - now.getTime()) / 1000))
    }
  }

  const forgotten =
    state === null || now.getTime() - state.lastAttemptAt.getTime() >= FORGET_AFTER_SECONDS * 1000
  const attempts = forgotten ? 1 : state.attempts + 1

  return {
    admitted: true,
    attempts,
    delayedUntil: new Date(now.getTime() + delaySecondsAfter(attempts) * 1000)
  }
}

export {
  admitAttempt,
  delaySecondsAfter,
  ATTEMPTS_BEFORE_DELAY,
  ATTEMPTS_PER_CHALLENGE,
  FIRST_DELAY_SECONDS,
  FORGET_AFTER_SECONDS,
  LONGEST_DELAY_SECONDS
}
