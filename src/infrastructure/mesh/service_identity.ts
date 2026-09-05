import { readFileSync } from "fs"
import { join } from "path"
import { ServerCredentials } from "@grpc/grpc-js"
import type { ServiceIdentityFiles } from "../../types/mesh.type"

const DEFAULT_PKI_DIR = "/pki"

function loadServiceIdentity(directory?: string): ServiceIdentityFiles {
  const dir = directory ?? process.env.KINETIX_PKI_DIR ?? DEFAULT_PKI_DIR

  const read = (name: string): Buffer => {
    try {
      return readFileSync(join(dir, name))
    } catch {
      throw new Error(
        `${name} is missing from ${dir}. This service's PKI is mounted there; issue it with ` +
          "kinetix-infrastructure/bin/kinetix-pki issue."
      )
    }
  }

  return { cert: read("tls.crt"), key: read("tls.key"), ca: read("ca.pem") }
}

function meshServerCredentials(files: ServiceIdentityFiles): ServerCredentials {
  return ServerCredentials.createSsl(
    files.ca,
    [{ private_key: files.key, cert_chain: files.cert }],
    true
  )
}

export { loadServiceIdentity, meshServerCredentials }
