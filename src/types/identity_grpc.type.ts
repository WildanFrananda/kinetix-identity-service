type ServiceLocalIdInput = {
  service?: string
  local_id?: string
  localId?: string
}

type ResolvePrincipalRequest = {
  service_local_id?: ServiceLocalIdInput
  serviceLocalId?: ServiceLocalIdInput
}

type ResolvePrincipalResponse = {
  found: boolean
  principal_id: string
  kind: PrincipalKind
  display_name: string
}

type PrincipalAliasView = {
  service: string
  local_id: string
}

type GetPrincipalRequest = {
  principal_id?: string
  principalId?: string
}

type GetPrincipalResponse = {
  found: boolean
  principal_id: string
  kind: PrincipalKind
  display_name: string
  aliases: PrincipalAliasView[]
}

type PrincipalKind =
  | "PRINCIPAL_KIND_UNSPECIFIED"
  | "PRINCIPAL_KIND_CUSTOMER"
  | "PRINCIPAL_KIND_MERCHANT"
  | "PRINCIPAL_KIND_DRIVER"
  | "PRINCIPAL_KIND_STAFF"
  | "PRINCIPAL_KIND_SERVICE"

type MerchantStatus =
  | "MERCHANT_STATUS_UNSPECIFIED"
  | "MERCHANT_STATUS_PENDING"
  | "MERCHANT_STATUS_VERIFIED"
  | "MERCHANT_STATUS_SUSPENDED"
  | "MERCHANT_STATUS_CLOSED"

type GetUserProfileRequest = {
  principal_id?: string
  principalId?: string
}

type GetUserProfileResponse = {
  found: boolean
  principal_id: string
  email: string
  full_name: string
  phone_number: string
  street_address: string
  city: string
  postal_code: string
  kind: PrincipalKind
  has_location: boolean
  location: { latitude: number; longitude: number }
}

type GetMerchantInfoRequest = {
  principal_id?: string
  principalId?: string
}

type GetMerchantInfoResponse = {
  found: boolean
  merchant_principal_id: string
  store_name: string
  business_registration_number: string
  tax_id: string
  status: MerchantStatus
  pickup_address: { street_address: string; city: string; postal_code: string }
  has_location: boolean
  location: { latitude: number; longitude: number }
  may_sell: boolean
}

type ProtoTimestampInput = {
  seconds?: number | string | { toString(): string }
  nanos?: number
}

type ProtoTimestamp = {
  seconds: number
  nanos: number
}

type MerchantCursorInput = {
  updated_through?: ProtoTimestampInput | null
  updatedThrough?: ProtoTimestampInput | null
  last_principal_id?: string
  lastPrincipalId?: string
}

type MerchantCursorView = {
  updated_through: ProtoTimestamp | null
  last_principal_id: string
}

type MerchantRecordView = {
  principal_id: string
  store_name: string
  status: MerchantStatus
  may_sell: boolean
  updated_at: ProtoTimestamp
}

type MerchantsChangedSinceRequest = {
  cursor?: MerchantCursorInput | null
  limit?: number
}

type MerchantsChangedSinceResponse = {
  upserted: MerchantRecordView[]
  removed_principal_ids: string[]
  next: MerchantCursorView
  has_more: boolean
}

type ValidateTokenRequest = {
  access_token?: string
  accessToken?: string
}

type ValidateTokenResponse = {
  valid: boolean
  principal_id: string
  kind: PrincipalKind
  reason: string
}

export type {
  GetMerchantInfoRequest,
  MerchantCursorInput,
  MerchantCursorView,
  MerchantRecordView,
  MerchantStatus,
  MerchantsChangedSinceRequest,
  MerchantsChangedSinceResponse,
  ProtoTimestamp,
  ProtoTimestampInput,
  PrincipalKind,
  GetMerchantInfoResponse,
  GetPrincipalRequest,
  GetPrincipalResponse,
  GetUserProfileRequest,
  GetUserProfileResponse,
  PrincipalAliasView,
  ResolvePrincipalRequest,
  ResolvePrincipalResponse,
  ServiceLocalIdInput,
  ValidateTokenRequest,
  ValidateTokenResponse
}
