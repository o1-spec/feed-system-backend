import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { TimelineService } from '../timeline/timeline.service.js';

/**
 * FeedService
 */

const FEED_POST_SELECT = {
  post: {
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
  },
  createdAt: true,
  id: true,
} as const;

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64');
}

function decodeCursor(cursor: string): { id: string; createdAt: string } {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
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

  /**
   * getHomeFeed — Returns the authenticated user's personalized home feed.
   *
   * Query strategy:
   * 1. Read from FeedItem table (materialized timeline) for the user.
   * 2. Filter out soft-deleted posts.
   * 3. Cursor pagination using (createdAt, id) compound — stable under concurrent writes.
   *
   * Index used: FeedItem(userId, createdAt DESC) → avoids full table scans.
   *
   * Cursor encoding: base64(JSON({ id, createdAt })) — opaque to the client.
   * Clients must treat it as a black box and pass it back verbatim.
   */
  async getHomeFeed(userId: string, query: FeedQueryDto) {
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

    // Fetch recent celebrity posts to merge at read-time
    const celebrityPosts = await this.getRecentCelebrityPosts(userId, cursorWhere, limit);
    let timelinePosts: any[] = [];
    let strategy = 'postgresql';

    // Check if the timeline is cached in Redis
    const isCached = await this.timelineService.isTimelineCached(userId);
    
    if (isCached) {
      let maxScore: number | undefined;
      if (query.cursor) {
        const { createdAt } = decodeCursor(query.cursor);
        maxScore = new Date(createdAt).getTime() - 1; // Exclusive max score
      }

      // Fetch from Redis
      const postIds = await this.timelineService.getTimeline(userId, maxScore, limit + 1);
      
      if (postIds.length > 0) {
        // Hydrate from PostgreSQL
        const posts = await this.prisma.post.findMany({
          where: { id: { in: postIds } },
          select: FEED_POST_SELECT.post.select,
        });

        // Re-order to match Redis sorting
        const postMap = new Map(posts.map(p => [p.id, p]));
        timelinePosts = postIds.map(id => postMap.get(id)).filter(Boolean);
        strategy = 'redis';
      }
    }

    // Fallback to PostgreSQL if Redis is empty or cache missed
    if (timelinePosts.length === 0) {
      this.logger.log(`Redis cache miss for user ${userId}, falling back to PostgreSQL`);
      const feedItems = await this.prisma.feedItem.findMany({
        where: {
          userId,
          post: { isDeleted: false },
          ...cursorWhere,
        },
        select: FEED_POST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      timelinePosts = feedItems.map((fi) => fi.post);
    }

    // Hybrid fanout merge
    let merged = [...timelinePosts, ...celebrityPosts];
    
    // Sort combined feed by createdAt DESC, id DESC
    merged.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff === 0) {
        return b.id.localeCompare(a.id);
      }
      return timeDiff;
    });

    // Deduplicate (in case a celebrity was recently promoted and some posts are in both)
    const uniqueMerged = Array.from(new Map(merged.map(p => [p.id, p])).values());

    const hasNextPage = uniqueMerged.length > limit;
    const items = hasNextPage ? uniqueMerged.slice(0, limit) : uniqueMerged;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    this.logger.log(`Feed fetched (Hybrid ${strategy}) for user ${userId}: ${items.length} items`);

    return {
      items,
      nextCursor,
      hasNextPage,
      meta: { count: items.length, strategy: `${strategy}-hybrid` },
    };
  }

  /**
   * getUserTimeline — Public timeline of posts by a specific user.
   *
   * Different from home feed: this is not personalized.
   * Used for the "Profile" tab — shows the user's own posts in order.
   * Reads directly from Post table (no FeedItem join needed).
   */
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

  /**
   * Fetch posts from celebrities the user follows.
   * Since celebrities are not fanned out to individual timelines, we pull them at read-time.
   */
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
