class RecordConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RecordConflictError"
  }
}

export default RecordConflictError
