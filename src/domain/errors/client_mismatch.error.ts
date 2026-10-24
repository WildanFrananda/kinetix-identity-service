class ClientMismatchError extends Error {
  readonly sessionClient: string | null

  constructor(sessionClient: string | null) {
    super(`this session belongs to the client ${sessionClient ?? "(unnamed)"}, not to the one renewing it`)
    this.name = "ClientMismatchError"
    this.sessionClient = sessionClient
  }
}

export default ClientMismatchError
