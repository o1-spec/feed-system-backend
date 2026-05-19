import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);
  private readonly timelineCacheSize: number;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.timelineCacheSize = this.configService.get<number>('feed.timelineCacheSize') || 1000;
  }

  private getTimelineKey(userId: string): string {
    return `timeline:${userId}`;
  }

  /**
   * Adds a post to a user's timeline and trims it to the max cache size.
   */
  async addPostToTimeline(userId: string, postId: string, timestamp: number): Promise<void> {
    const key = this.getTimelineKey(userId);
    
    // Use pipeline to ensure atomic execution and reduce network roundtrips
    await this.redis
      .pipeline()
      .zadd(key, timestamp, postId)
      .zremrangebyrank(key, 0, -(this.timelineCacheSize + 1)) // Keep only top N
      .exec();
  }

  /**
   * Removes a post from a user's timeline (e.g., if deleted).
   */
  async removePostFromTimeline(userId: string, postId: string): Promise<void> {
    const key = this.getTimelineKey(userId);
    await this.redis.zrem(key, postId);
  }

  /**
   * Retrieves paginated post IDs from the user's timeline.
   * Returns array of post IDs.
   */
  async getTimeline(userId: string, cursor?: number, limit = 20): Promise<string[]> {
    const key = this.getTimelineKey(userId);
    
    // If no cursor is provided, fetch from the very top (+inf)
    const maxScore = cursor ? `(${cursor}` : '+inf';
    
    // ZREVRANGEBYSCORE key max min LIMIT offset count
    return this.redis.zrevrangebyscore(key, maxScore, '-inf', 'LIMIT', 0, limit);
  }

  /**
   * Checks if the timeline exists in Redis (to handle cold starts).
   * A simple ZCARD is O(1).
   */
  async isTimelineCached(userId: string): Promise<boolean> {
    const key = this.getTimelineKey(userId);
    const count = await this.redis.zcard(key);
    return count > 0;
  }
}
