import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — Marks a route as publicly accessible (bypasses JwtAuthGuard).
 *
 * Strategy: JwtAuthGuard is applied GLOBALLY in AppModule.
 * This decorator opts specific routes OUT of authentication.
 *
 * Prefer this over removing the guard — secure-by-default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
