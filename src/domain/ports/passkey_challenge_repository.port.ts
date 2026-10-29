interface PasskeyChallengeRepositoryPort {
  issueRegistration(userId: number, challenge: string, lifetimeSeconds: number): Promise<string>
  issueSignIn(userId: number, mfaJti: string, challenge: string, lifetimeSeconds: number): Promise<void>
  spendRegistration(challengeId: string, userId: number): Promise<string | null>
  spendSignIn(mfaJti: string, userId: number): Promise<string | null>
  sweep(): Promise<number>
}

export default PasskeyChallengeRepositoryPort
