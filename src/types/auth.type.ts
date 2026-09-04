type CurrentUserView = {
  principalId: string
  userId: number
  email: string
  role: string
  expiresAt: string
}

type AuthenticatedAccount = {
  id: number
  email: string
  role: string
  principalId: string
}

type LogoutBody = {
  refreshToken?: string
}

export type { AuthenticatedAccount, CurrentUserView, LogoutBody }
