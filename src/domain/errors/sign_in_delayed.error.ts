class SignInDelayedError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(`sign-in attempts for this account are delayed for ${retryAfterSeconds} s`)
    this.name = "SignInDelayedError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export default SignInDelayedError
