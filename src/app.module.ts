import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { FeedModule } from './modules/feed/feed.module.js';
import { RedisModule } from './modules/redis/redis.module.js';
import { TimelineModule } from './modules/timeline/timeline.module.js';
import { FanoutWorkerModule } from './modules/workers/fanout/fanout.module.js';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

@Module({
  imports: [
    // ConfigModule is global — no need to import in feature modules
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // PrismaModule is @Global — PrismaService available everywhere
    PrismaModule,

    // BullMQ configuration using global Redis settings
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
    }),

    // Feature modules
    RedisModule,
    TimelineModule,
    FanoutWorkerModule,
    AuthModule,
    UsersModule,
    PostsModule,
    FeedModule,
  ],
  providers: [
    // Global JWT guard — every route is protected by default
    // Use @Public() decorator to opt specific routes out
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Global exception filter — consistent error shape across all routes
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global interceptors — applied in declaration order
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
