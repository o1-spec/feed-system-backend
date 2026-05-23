import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Basic logging configuration
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['log', 'error', 'warn', 'debug'],
  });

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(process.env.REDIS_URL || 'redis://localhost:6379');
  app.useWebSocketAdapter(redisIoAdapter);

  // Global prefix for all routes
  app.setGlobalPrefix('api/v1');

  
  
  
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Feed System API')
      .setDescription(
        'Scalable News Feed System — Twitter/X-style feed with fanout-on-write, Redis timeline caching, and BullMQ workers.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Registration, login, token refresh')
      .addTag('Users', 'Profiles, follow/unfollow')
      .addTag('Posts', 'Post CRUD, likes, comments')
      .addTag('Feed', 'Home feed and user timelines')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀 Feed System API running at: http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger UI available at:     http://localhost:${port}/api/docs\n`);
}

bootstrap();
