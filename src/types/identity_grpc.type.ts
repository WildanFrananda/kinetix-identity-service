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
  MerchantStatus,
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
