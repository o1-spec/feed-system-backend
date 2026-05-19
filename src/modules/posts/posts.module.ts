import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { TimelineModule } from '../timeline/timeline.module.js';

@Module({
  imports: [
    TimelineModule,
    BullModule.registerQueue({ name: 'fanout' }),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
