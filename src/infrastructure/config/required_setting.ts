function requiredSetting(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required and has no default. Set it in the environment.`)
  }

  return value
}

function positiveIntegerSetting(name: string, value: string | undefined): number {
  const raw = requiredSetting(name, value).trim()
  const parsed = Number(raw)

  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} is "${raw}", which is not a positive whole number.`)
  }

  return parsed
}

export { positiveIntegerSetting, requiredSetting }
