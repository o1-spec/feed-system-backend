import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TimelineService } from '../../timeline/timeline.service.js';
import { FanoutJobData } from './interfaces/fanout-job.interface.js';

@Processor('fanout')
export class FanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(FanoutProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: TimelineService,
  ) {
    super();
  }

  async process(job: Job<FanoutJobData, void, string>): Promise<void> {
    const { authorId, postId, timestamp } = job.data;
    const createdAt = new Date(timestamp);

    this.logger.log(`Processing fanout for post ${postId} by author ${authorId}`);

    // Fetch all followers in chunks to avoid blowing up memory for huge accounts
    // We skip this entirely for celebrity accounts
    const CHUNK_SIZE = 500;
    let skip = 0;
    let totalFannedOut = 0;

    while (true) {
      const followers = await this.prisma.follow.findMany({
        where: { followingId: authorId },
        select: { followerId: true },
        skip,
        take: CHUNK_SIZE,
      });

      if (followers.length === 0) break;

      // 1. PostgreSQL Materialization
      await this.prisma.feedItem.createMany({
        data: followers.map((f) => ({
          userId: f.followerId,
          postId,
          authorId,
          createdAt,
        })),
        skipDuplicates: true,
      });

      // 2. Redis Cache Update
      await Promise.all(
        followers.map((f) =>
          this.timelineService.addPostToTimeline(f.followerId, postId, timestamp)
        )
      );

      totalFannedOut += followers.length;
      skip += CHUNK_SIZE;
    }

    this.logger.log(`Finished fanout for post ${postId} to ${totalFannedOut} followers.`);
  }
}
