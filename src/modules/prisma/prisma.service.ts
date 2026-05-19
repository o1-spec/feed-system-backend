import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaService — wraps the Prisma v7 client as a NestJS injectable.
 *
 * WHY COMPOSITION OVER INHERITANCE (Prisma v7):
 * Prisma v7 changed from a traditional class (`new PrismaClient()`) to a
 * factory-based client (`getPrismaClientClass()`). The returned constructor
 * is a runtime-generated interface, not a real ES class, so `extends PrismaClient`
 * doesn't work with TypeScript's structural typing in this version.
 *
 * Solution: expose the client instance directly via the `client` property,
 * AND re-export all model delegates as shorthand getters so call sites
 * can continue using `this.prisma.user.findMany()` syntax.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly _client: PrismaClient;

  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    this._client = new PrismaClient({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this._client.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this._client.$disconnect();
    this.logger.log('Database connection closed');
  }

  // ─── Delegate Getters ──────────────────────────────────────────────────────
  // These allow `this.prisma.user.findMany()` syntax throughout the codebase.

  get user() { return this._client.user; }
  get post() { return this._client.post; }
  get follow() { return this._client.follow; }
  get like() { return this._client.like; }
  get comment() { return this._client.comment; }
  get notification() { return this._client.notification; }
  get feedItem() { return this._client.feedItem; }

  // ─── Raw Query / Transaction Pass-throughs ─────────────────────────────────

  get $transaction() { return this._client.$transaction.bind(this._client); }
  get $queryRaw() { return this._client.$queryRaw.bind(this._client); }
  get $executeRaw() { return this._client.$executeRaw.bind(this._client); }
}
