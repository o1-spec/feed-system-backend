import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from '../auth.service.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';

/**
 * JwtRefreshStrategy — validates refresh tokens sent in the request body.
 *
 * Why store the refresh token hash in DB instead of a purely stateless approach?
 * — Allows true logout: invalidating the stored hash revokes the refresh token.
 * — Stateless refresh tokens cannot be revoked before expiry — security risk.
 *
 * Trade-off: one DB lookup per token refresh (every 15 minutes max). Acceptable cost.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: configService.get<string>('jwt.refreshSecret')!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = req.body?.refreshToken as string;
    if (!refreshToken) throw new ForbiddenException('Refresh token missing');

    return this.authService.validateRefreshToken(payload.sub, refreshToken);
  }
}
