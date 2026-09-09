import { readFileSync } from "fs"
import { dirname, join } from "path"

const SERVICE_NAME = "kinetix-identity-service"

const UNKNOWN_VERSION = "unknown"

const MAX_ASCENT = 6

const SERVICE_VERSION: string = resolveVersion()

function resolveVersion(): string {
  const declared = process.env.SERVICE_VERSION?.trim()
  if (declared !== undefined && declared !== "") {
    return declared
  }

  const start = typeof __dirname === "string" ? __dirname : process.cwd()

  let directory = start
  for (let ascent = 0; ascent < MAX_ASCENT; ascent += 1) {
    const version = versionOfManifest(join(directory, "package.json"))
    if (version !== null) {
      return version
    }

    const parent = dirname(directory)
    if (parent === directory) {
      break
    }
    directory = parent
  }

  return UNKNOWN_VERSION
}

function versionOfManifest(path: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null
  }

  const manifest = parsed as { name?: unknown; version?: unknown }
  if (manifest.name !== SERVICE_NAME) {
    return null
  }
  if (typeof manifest.version !== "string" || manifest.version === "") {
    return null
  }

  return manifest.version
}

export { SERVICE_NAME, SERVICE_VERSION, UNKNOWN_VERSION }
