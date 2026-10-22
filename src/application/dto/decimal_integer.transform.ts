import type { TransformFnParams } from "class-transformer"

function decimalInteger({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") {
    return value
  }

  return /^[0-9]{1,10}$/.test(value) ? Number(value) : Number.NaN
}

export { decimalInteger }
