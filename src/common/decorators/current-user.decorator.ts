import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() — Extracts the authenticated user from the JWT payload.
 *
 * Usage:
 *   getProfile(@CurrentUser() user: JwtPayload) { ... }
 *   getId(@CurrentUser('id') id: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
