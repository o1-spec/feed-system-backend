import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { TimelineModule } from '../timeline/timeline.module.js';

@Module({
  imports: [TimelineModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
