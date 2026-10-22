import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common"

const LARGEST_ACCOUNT_ID = 2147483647

function accountIdOf(raw: string | undefined): number {
  const id = Number(raw)

  if (raw === undefined || !/^[1-9][0-9]{0,9}$/.test(raw) || id > LARGEST_ACCOUNT_ID) {
    throw new BadRequestException(`An account id is a whole number from 1 to ${LARGEST_ACCOUNT_ID}`)
  }

  return id
}

const AccountIdParam = createParamDecorator((name: string, context: ExecutionContext): number => {
  const request = context.switchToHttp().getRequest<{ params: Record<string, string | undefined> }>()
  return accountIdOf(request.params[name])
})

export { AccountIdParam, accountIdOf }
