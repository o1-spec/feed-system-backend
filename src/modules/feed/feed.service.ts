import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { TimelineService } from '../timeline/timeline.service.js';

import { getPostSelect, mapPost } from '../../common/utils/post.utils.js';

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

    let cursorTimestamp: number | undefined;
    let cursorWhere = {};

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      cursorTimestamp = new Date(decoded.createdAt).getTime();
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    // 1. Fetch post IDs from Redis Timeline (O(1) in-memory range lookup)
    const timelinePostIds = await this.timelineService.getTimeline(userId, cursorTimestamp, limit + 1);

    // 2. Hydrate Redis posts via Prisma
    let timelinePosts: any[] = [];
    if (timelinePostIds.length > 0) {
      timelinePosts = await this.prisma.post.findMany({
        where: {
          id: { in: timelinePostIds },
          isDeleted: false,
        },
        select: getPostSelect(userId),
      });
    }

    // 3. Fetch recent celebrity posts (Pull-on-read fallback)
    const celebrityPosts = await this.getRecentCelebrityPosts(userId, cursorWhere, limit + 1);

    // 4. Merge, deduplicate, and sort chronologically
    const allPostsMap = new Map();
    timelinePosts.forEach(p => allPostsMap.set(p.id, p));
    celebrityPosts.forEach(p => allPostsMap.set(p.id, p));

    const mergedPosts = Array.from(allPostsMap.values()).sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id); // Tie-breaker
    });

    // 5. Pagination
    const hasNextPage = mergedPosts.length > limit;
    const items = hasNextPage ? mergedPosts.slice(0, limit) : mergedPosts;
    const mappedItems = items.map(mapPost);

    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last
      ? encodeCursor(last.id, last.createdAt)
      : null;

    this.logger.log(`Redis-Timeline Hybrid feed generated for user ${userId}: ${items.length} items returned`);

    return {
      items: mappedItems,
      nextCursor,
      hasNextPage,
      meta: {
        count: items.length,
        strategy: 'redis-timeline-hybrid',
      },
    };
  }

  
  async getUserTimeline(profileUserId: string, requestingUserId: string, query: FeedQueryDto) {
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
      select: getPostSelect(requestingUserId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;
    const mappedItems = items.map(mapPost);
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items: mappedItems, nextCursor, hasNextPage };
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
      select: getPostSelect(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }
}
