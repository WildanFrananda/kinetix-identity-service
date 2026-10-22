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

type Credentials = {
  email: string
  password: string
}

export type { AuthenticatedAccount, Credentials, CurrentUserView }
