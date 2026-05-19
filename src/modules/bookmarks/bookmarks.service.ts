import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async bookmarkPost(userId: string, postId: string) {
    // 1. Check if post exists and is not deleted
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // 2. Check if already bookmarked
    const existing = await this.prisma.bookmark.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Post already bookmarked');
    }

    // 3. Create bookmark
    return this.prisma.bookmark.create({
      data: { userId, postId },
      select: {
        id: true,
        userId: true,
        postId: true,
        createdAt: true,
      },
    });
  }

  async unbookmarkPost(userId: string, postId: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Bookmark not found');
    }

    await this.prisma.bookmark.delete({
      where: {
        userId_postId: { userId, postId },
      },
    });

    return { message: 'Bookmark removed successfully' };
  }

  async getBookmarkedPosts(userId: string, query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id, createdAt } = this.decodeCursor(query.cursor);
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ],
      };
    }

    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        userId,
        post: { isDeleted: false },
        ...cursorWhere,
      },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            likesCount: true,
            commentsCount: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isCelebrity: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = bookmarks.length > limit;
    const items = hasNextPage ? bookmarks.slice(0, limit) : bookmarks;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? this.encodeCursor(last.id, last.createdAt) : null;

    return {
      items: items.map((b) => b.post),
      nextCursor,
      hasNextPage,
    };
  }

  private encodeCursor(id: string, createdAt: Date): string {
    return Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64');
  }

  private decodeCursor(cursor: string): { id: string; createdAt: string } {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }
}
