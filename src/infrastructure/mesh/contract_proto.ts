import { dirname, join } from "path"

function contractProtoRoot(): string {
  const manifest = require.resolve("kinetix-contracts/package.json")
  return join(dirname(manifest), "proto")
}

function contractProto(relative: string): string {
  return join(contractProtoRoot(), relative)
}

export { contractProto, contractProtoRoot }
