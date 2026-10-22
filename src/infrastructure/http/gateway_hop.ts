import { BlockList, isIP } from "net"

const INTERNAL_NETWORKS = new BlockList()
INTERNAL_NETWORKS.addSubnet("127.0.0.0", 8, "ipv4")
INTERNAL_NETWORKS.addSubnet("10.0.0.0", 8, "ipv4")
INTERNAL_NETWORKS.addSubnet("172.16.0.0", 12, "ipv4")
INTERNAL_NETWORKS.addSubnet("192.168.0.0", 16, "ipv4")
INTERNAL_NETWORKS.addAddress("::1", "ipv6")
INTERNAL_NETWORKS.addSubnet("fc00::", 7, "ipv6")

function isGatewayHop(address: string, hop: number): boolean {
  if (hop !== 0) {
    return false
  }

  const family = isIP(address)
  if (family === 0) {
    return false
  }

  return INTERNAL_NETWORKS.check(address, family === 6 ? "ipv6" : "ipv4")
}

export { isGatewayHop }
