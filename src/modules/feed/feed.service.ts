import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { TimelineService } from '../timeline/timeline.service.js';

const FEED_POST_SELECT = {
  post: {
    select: {
      id: true,
      content: true,
      imageUrl: true,
      likesCount: true,
      commentsCount: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isCelebrity: true,
        },
      },
    },
  },
  createdAt: true,
  id: true,
} as const;

function encodeCursor(id: string, createdAt: Date, weight: number = 0): string {
  return Buffer.from(
    JSON.stringify({ id, createdAt: createdAt.toISOString(), weight })
  ).toString('base64');
}

function decodeCursor(cursor: string): { id: string; createdAt: string; weight: number } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    return {
      id: parsed.id,
      createdAt: parsed.createdAt,
      weight: parsed.weight ?? 0,
    };
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: TimelineService,
  ) {}

  async getHomeFeed(userId: string, query: FeedQueryDto) {
    const limit = query.limit ?? 20;

    let cursorWeight = 2; // Default starting weight (Following)
    let cursorWhere = {};

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      cursorWeight = decoded.weight;
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    // 1. Resolve following and follower IDs for active user
    const [following, followers] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      }),
    ]);

    const followingIds = following.map((f) => f.followingId);
    const followerIds = followers.map((f) => f.followerId);

    const mergedItems: any[] = [];

    // --- WEIGHT 2: Followed Users & Celebrity Accounts ---
    if (cursorWeight === 2 && followingIds.length > 0) {
      const followedPosts = await this.prisma.post.findMany({
        where: {
          authorId: { in: followingIds },
          isDeleted: false,
          ...cursorWhere,
        },
        select: FEED_POST_SELECT.post.select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      mergedItems.push(...followedPosts.map(p => ({ ...p, weight: 2 })));
    }

    // --- WEIGHT 1: Inbound Followers (not followed back) ---
    if (cursorWeight >= 1 && mergedItems.length <= limit) {
      const remainingLimit = limit + 1 - mergedItems.length;
      const inboundFollowers = followerIds.filter(id => !followingIds.includes(id));

      if (inboundFollowers.length > 0) {
        const followerPosts = await this.prisma.post.findMany({
          where: {
            authorId: { in: inboundFollowers },
            isDeleted: false,
            ...(cursorWeight === 1 ? cursorWhere : {}),
          },
          select: FEED_POST_SELECT.post.select,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: remainingLimit,
        });

        mergedItems.push(...followerPosts.map(p => ({ ...p, weight: 1 })));
      }
    }

    // --- WEIGHT 0: Global Discovery Pool ---
    if (mergedItems.length <= limit) {
      const remainingLimit = limit + 1 - mergedItems.length;
      const excludedAuthorIds = [userId, ...followingIds, ...followerIds];

      const globalPosts = await this.prisma.post.findMany({
        where: {
          authorId: { notIn: excludedAuthorIds },
          isDeleted: false,
          ...(cursorWeight === 0 ? cursorWhere : {}),
        },
        select: FEED_POST_SELECT.post.select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: remainingLimit,
      });

      mergedItems.push(...globalPosts.map(p => ({ ...p, weight: 0 })));
    }

    const hasNextPage = mergedItems.length > limit;
    const items = hasNextPage ? mergedItems.slice(0, limit) : mergedItems;

    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last
      ? encodeCursor(last.id, last.createdAt, last.weight)
      : null;

    this.logger.log(`Weighted feed generated for user ${userId}: ${items.length} items returned`);

    return {
      items,
      nextCursor,
      hasNextPage,
      meta: {
        count: items.length,
        strategy: 'weighted-discovery-hybrid',
      },
    };
  }

  
  async getUserTimeline(profileUserId: string, query: FeedQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id, createdAt } = decodeCursor(query.cursor);
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ],
      };
    }

    const posts = await this.prisma.post.findMany({
      where: { authorId: profileUserId, isDeleted: false, ...cursorWhere },
      select: {
        id: true,
        content: true,
        likesCount: true,
        commentsCount: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isCelebrity: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items, nextCursor, hasNextPage };
  }

  
  private async getRecentCelebrityPosts(userId: string, cursorWhere: any, limit: number) {
    const follows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        following: { isCelebrity: true },
      },
      select: { followingId: true },
    });

    if (follows.length === 0) return [];

    const celebrityIds = follows.map((f) => f.followingId);

    return this.prisma.post.findMany({
      where: {
        authorId: { in: celebrityIds },
        isDeleted: false,
        ...cursorWhere,
      },
      select: FEED_POST_SELECT.post.select,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }
}
