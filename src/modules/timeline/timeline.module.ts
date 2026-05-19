import { Module } from '@nestjs/common';
import { TimelineService } from './timeline.service.js';

@Module({
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
