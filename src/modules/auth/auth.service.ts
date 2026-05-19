import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email or username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.username,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.username, user.email);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);

    this.logger.log(`New user registered: ${user.username}`);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, username: true, email: true, passwordHash: true },
    });

    
    const isPasswordValid =
      user !== null && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.username, user.email);
    await this.storeRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      user: { id: user.id, username: user.username, email: user.email },
      ...tokens,
    };
  }

  async logout(userId: string): Promise<void> {
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.logger.log(`User logged out: ${userId}`);
  }

  async validateRefreshToken(userId: string, rawToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, refreshToken: true },
    });

    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const isValid = await bcrypt.compare(rawToken, user.refreshToken);
    if (!isValid) throw new ForbiddenException('Access denied');

    return { id: user.id, username: user.username, email: user.email };
  }

  async refreshTokens(userId: string, username: string, email: string): Promise<TokenPair> {
    const tokens = await this.generateTokens(userId, username, email);
    await this.storeRefreshTokenHash(userId, tokens.refreshToken);
    return tokens;
  }

  private async generateTokens(
    userId: string,
    username: string,
    email: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, username, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret')!,
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret')!,
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshTokenHash(userId: string, rawToken: string): Promise<void> {
    const hash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }
}
