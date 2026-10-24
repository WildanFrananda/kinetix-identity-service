import UserEntity from "../src/domain/entities/user.entity"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import SignInAttemptsService from "../src/application/services/sign_in_attempts.service"
import InMemorySignInAttempts from "./support/in_memory_sign_in_attempts"
import InMemoryUsers from "./support/in_memory_users"
import { labClientGate, unnamedContext } from "./support/client_gates"
import { tokenServiceWithFakes } from "./support/identity_app"

const PRINCIPAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

describe("refreshing a session", () => {
  it("leaves the refresh token unspent when the principal cannot be resolved", async () => {
    const { tokens } = tokenServiceWithFakes()
    const users = new InMemoryUsers()
    users.add(new UserEntity(5, "customer@kinetix.test", "hash", "customer"))
    const principals = {
      resolveOrMintForUser: jest
        .fn()
        .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
        .mockResolvedValue(PRINCIPAL),
      syncKind: jest.fn().mockResolvedValue(undefined)
    }
    const auth = new AuthUsecaseService(
      users,
      tokens,
      principals as any,
      new SignInAttemptsService(new InMemorySignInAttempts()),
      labClientGate()
    )
    const pair = await tokens.issuePair({ id: 5, email: "customer@kinetix.test", role: "customer" }, PRINCIPAL, null)
    const context = unnamedContext("req-refresh")

    await expect(auth.refresh(pair.refreshToken, context)).rejects.toThrow("Connection terminated unexpectedly")

    const renewed = await auth.refresh(pair.refreshToken, context)
    expect(renewed.refreshToken).not.toBe(pair.refreshToken)
    expect(renewed.user.principalId).toBe(PRINCIPAL)

    await expect(auth.refresh(pair.refreshToken, context)).rejects.toThrow("already been used")
  })
})
