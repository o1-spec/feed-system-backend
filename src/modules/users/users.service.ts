import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  followerCount: true,
  followingCount: true,
  isCelebrity: true,
  createdAt: true,
} as const;

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64');
}

function decodeCursor(cursor: string): { id: string; createdAt: string } {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly celebrityThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.celebrityThreshold = this.configService.get<number>('feed.celebrityThreshold') ?? 100;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PUBLIC_USER_SELECT,
    });
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, followerCount: true },
    });
    if (!target) throw new NotFoundException('User not found');

    
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) throw new ConflictException('Already following this user');

    
    await this.prisma.$transaction([
      this.prisma.follow.create({ data: { followerId, followingId } }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followingId },
        data: { followerCount: { increment: 1 } },
      }),
    ]);

    
    const newCount = target.followerCount + 1;
    if (newCount >= this.celebrityThreshold) {
      await this.prisma.user.update({
        where: { id: followingId },
        data: { isCelebrity: true },
      });
      this.logger.log(`User ${followingId} promoted to celebrity (${newCount} followers)`);
    }

    return { message: 'Followed successfully' };
  }

  async unfollow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (!existing) throw new NotFoundException('Follow relationship not found');

    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: { followerId_followingId: { followerId, followingId } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followingId },
        data: { followerCount: { decrement: 1 } },
      }),
    ]);

    
    const updated = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { followerCount: true, isCelebrity: true },
    });
    if (updated?.isCelebrity && updated.followerCount < this.celebrityThreshold) {
      await this.prisma.user.update({
        where: { id: followingId },
        data: { isCelebrity: false },
      });
    }

    return { message: 'Unfollowed successfully' };
  }

  async getFollowers(userId: string, query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id } = decodeCursor(query.cursor);
      cursorWhere = { id: { lt: id } };
    }

    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId, ...cursorWhere },
      select: {
        id: true,
        createdAt: true,
        follower: { select: PUBLIC_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasNextPage = follows.length > limit;
    const items = hasNextPage ? follows.slice(0, limit) : follows;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items: items.map((f) => f.follower), nextCursor, hasNextPage };
  }

  async getFollowing(userId: string, query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id } = decodeCursor(query.cursor);
      cursorWhere = { id: { lt: id } };
    }

    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, ...cursorWhere },
      select: {
        id: true,
        createdAt: true,
        following: { select: PUBLIC_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasNextPage = follows.length > limit;
    const items = hasNextPage ? follows.slice(0, limit) : follows;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items: items.map((f) => f.following), nextCursor, hasNextPage };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
    return follow !== null;
  }
}
