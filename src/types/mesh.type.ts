import type { PeerCertificate } from "tls"

type ServiceIdentityFiles = {
  cert: Buffer
  key: Buffer
  ca: Buffer
}

type PeerAuthContext = {
  sslPeerCertificate?: PeerCertificate
}

export type { ServiceIdentityFiles, PeerAuthContext }
