import { Module } from '@nestjs/common';
import { FanoutProcessor } from './fanout.processor.js';
import { TimelineModule } from '../../timeline/timeline.module.js';

@Module({
  imports: [TimelineModule],
  providers: [FanoutProcessor],
})
export class FanoutWorkerModule {}
