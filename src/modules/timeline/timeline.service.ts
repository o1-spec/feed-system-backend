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

  
  async addPostToTimeline(userId: string, postId: string, timestamp: number): Promise<void> {
    const key = this.getTimelineKey(userId);
    
    
    await this.redis
      .pipeline()
      .zadd(key, timestamp, postId)
      .zremrangebyrank(key, 0, -(this.timelineCacheSize + 1)) 
      .exec();
  }

  
  async removePostFromTimeline(userId: string, postId: string): Promise<void> {
    const key = this.getTimelineKey(userId);
    await this.redis.zrem(key, postId);
  }

  
  async getTimeline(userId: string, cursor?: number, limit = 20): Promise<string[]> {
    const key = this.getTimelineKey(userId);
    
    
    const maxScore = cursor ? `(${cursor}` : '+inf';
    
    
    return this.redis.zrevrangebyscore(key, maxScore, '-inf', 'LIMIT', 0, limit);
  }

  
  async isTimelineCached(userId: string): Promise<boolean> {
    const key = this.getTimelineKey(userId);
    const count = await this.redis.zcard(key);
    return count > 0;
  }
}
