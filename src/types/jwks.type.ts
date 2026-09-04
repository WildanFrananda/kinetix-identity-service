type JsonWebKey = Record<string, string>

type JwksDocument = {
  keys: JsonWebKey[]
}

export type { JsonWebKey, JwksDocument }
