const MAY_DRIVE: ReadonlyArray<string> = ["approved"]

function mayDrive(role: string, status: string, vehiclePlate: string | null): boolean {
  return (
    role === "courier" &&
    MAY_DRIVE.includes(status) &&
    typeof vehiclePlate === "string" &&
    vehiclePlate.trim().length > 0
  )
}

export { MAY_DRIVE, mayDrive }
