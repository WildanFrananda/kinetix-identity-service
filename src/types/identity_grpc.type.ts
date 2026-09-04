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
  kind: string
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
  kind: string
  display_name: string
  aliases: PrincipalAliasView[]
}

type GetUserProfileRequest = {
  user_id: number
}

type GetUserProfileResponse = {
  user_id: number
  email: string
  full_name: string
  phone_number: string
  street_address: string
  city: string
  postal_code: string
  role: string
}

type GetMerchantInfoRequest = {
  user_id: number
}

type GetMerchantInfoResponse = {
  user_id: number
  store_name: string
  business_registration_number: string
  tax_id: string
  status: string
}

type ValidateTokenRequest = {
  access_token?: string
  accessToken?: string
}

type ValidateTokenResponse = {
  valid: boolean
  principal_id: string
  kind: string
  reason: string
}

export type {
  GetMerchantInfoRequest,
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
