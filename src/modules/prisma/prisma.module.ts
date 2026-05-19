import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * @Global() — PrismaService is available everywhere without re-importing PrismaModule.
 * Only needs to be imported once in AppModule.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
