type LogField = string | number | boolean

type LogEvent = {
  message: string
  requestId?: string | null
  fields?: Readonly<Record<string, LogField>>
}

export type { LogEvent, LogField }
