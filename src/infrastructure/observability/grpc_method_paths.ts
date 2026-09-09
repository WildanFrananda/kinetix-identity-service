import type { PackageDefinition } from "@grpc/proto-loader"

function grpcMethodPathsOf(packageDefinition: PackageDefinition): readonly string[] {
  const paths: string[] = []

  for (const definition of Object.values(packageDefinition)) {
    if (typeof definition !== "object" || definition === null) {
      continue
    }

    for (const member of Object.values(definition as Record<string, unknown>)) {
      if (typeof member !== "object" || member === null) {
        continue
      }

      const path: unknown = (member as { path?: unknown }).path
      if (typeof path === "string" && path.startsWith("/")) {
        paths.push(path)
      }
    }
  }

  return paths
}

export { grpcMethodPathsOf }
