class MissingReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MissingReferenceError"
  }
}

export default MissingReferenceError
