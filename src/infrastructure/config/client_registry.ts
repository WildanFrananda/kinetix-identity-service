import { requiredSetting } from "./required_setting"
import type { ClientProofKind, ClientRegistry, RegisteredClient, UnnamedClientPolicy } from "../../types/client.type"

const CLIENT_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u

const LONGEST_CLIENT_NAME = 64

const RESERVED_CLIENT_NAMES: ReadonlySet<string> = new Set(["unnamed", "unknown"])

const PROJECT_NUMBER = /^[0-9]+$/u

const FIREBASE_APP_ID = /^[0-9]+:([0-9]+):[a-z]+:[0-9A-Za-z]+$/u

function clientRegistryFrom(read: (name: string) => string | undefined): ClientRegistry {
  const unnamed = unnamedPolicyOf(requiredSetting("IDENTITY_UNNAMED_CLIENTS", read("IDENTITY_UNNAMED_CLIENTS")))
  const declared = declaredClientsOf(requiredSetting("IDENTITY_CLIENTS", read("IDENTITY_CLIENTS")))
  const clients = new Map<string, RegisteredClient>()
  let projectNumber: string | null = null

  for (const [name, proof] of declared) {
    if (proof === "none") {
      clients.set(name, { name, proof })
      continue
    }

    projectNumber = projectNumber ?? projectNumberOf(read("FIREBASE_PROJECT_NUMBER"))
    clients.set(name, { name, proof, appIds: appIdsOf(name, projectNumber, read) })
  }

  return { clients, unnamed, firebaseProjectNumber: projectNumber }
}

function unnamedPolicyOf(raw: string): UnnamedClientPolicy {
  const policy = raw.trim()
  if (policy !== "allow" && policy !== "refuse") {
    throw new Error(`IDENTITY_UNNAMED_CLIENTS is "${policy}"; it must be allow or refuse.`)
  }

  return policy
}

function declaredClientsOf(raw: string): Map<string, ClientProofKind> {
  const declared = new Map<string, ClientProofKind>()

  for (const entry of raw.split(",").map((part) => part.trim())) {
    const [name, proof, ...rest] = entry.split(":").map((part) => part.trim())
    if (entry.length === 0 || name === undefined || proof === undefined || rest.length > 0) {
      throw new Error(`IDENTITY_CLIENTS holds "${entry}"; every entry is name:proof, separated by commas.`)
    }

    if (!CLIENT_NAME.test(name) || name.length > LONGEST_CLIENT_NAME || RESERVED_CLIENT_NAMES.has(name)) {
      throw new Error(
        `IDENTITY_CLIENTS names the client "${name}"; a name is lower-case words joined by "-", at most ` +
          `${LONGEST_CLIENT_NAME} characters, and neither "unnamed" nor "unknown".`
      )
    }

    if (proof !== "app_check" && proof !== "none") {
      throw new Error(`IDENTITY_CLIENTS gives "${name}" the proof "${proof}"; a proof is app_check or none.`)
    }

    if (declared.has(name)) {
      throw new Error(`IDENTITY_CLIENTS names "${name}" twice.`)
    }

    declared.set(name, proof)
  }

  return declared
}

function projectNumberOf(raw: string | undefined): string {
  const projectNumber = requiredSetting("FIREBASE_PROJECT_NUMBER", raw).trim()
  if (!PROJECT_NUMBER.test(projectNumber)) {
    throw new Error(
      `FIREBASE_PROJECT_NUMBER is "${projectNumber}"; it is the Firebase project's number (digits), not its id.`
    )
  }

  return projectNumber
}

function appIdSettingOf(name: string): string {
  return `IDENTITY_APP_CHECK_APP_IDS_${name.toUpperCase().replace(/-/gu, "_")}`
}

function appIdsOf(
  name: string,
  projectNumber: string,
  read: (name: string) => string | undefined
): ReadonlySet<string> {
  const setting = appIdSettingOf(name)
  const appIds = new Set<string>()

  for (const appId of requiredSetting(setting, read(setting)).split(",").map((part) => part.trim())) {
    const match = FIREBASE_APP_ID.exec(appId)
    if (match === null) {
      throw new Error(`${setting} holds "${appId}", which is not a Firebase app id (1:<number>:<platform>:<hash>).`)
    }

    if (match[1] !== projectNumber) {
      throw new Error(`${setting} holds "${appId}", an app of another project than FIREBASE_PROJECT_NUMBER.`)
    }

    appIds.add(appId)
  }

  return appIds
}

export { appIdSettingOf, clientRegistryFrom }
