import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { TimelineService } from '../timeline/timeline.service.js';
import { FanoutJobData } from '../workers/fanout/interfaces/fanout-job.interface.js';
import { CreateCommentDto } from './dto/post-interaction.dto.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';

import { getPostSelect, mapPost } from '../../common/utils/post.utils.js';

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64');
}

function decodeCursor(cursor: string): { id: string; createdAt: string } {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: TimelineService,
    @InjectQueue('fanout') private readonly fanoutQueue: Queue<FanoutJobData>,
  ) {}

  async createPost(authorId: string, dto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: { content: dto.content, authorId, imageUrl: dto.imageUrl },
      select: getPostSelect(authorId),
    });

    this.logger.log(`Post created: ${post.id} by user ${authorId} (celebrity: ${post.author.isCelebrity})`);

    
    
    await this.fanoutToFollowers(authorId, post.id, post.createdAt, post.author.isCelebrity);

    return mapPost(post);
  }

  private async fanoutToFollowers(
    authorId: string,
    postId: string,
    createdAt: Date,
    isCelebrity: boolean,
  ): Promise<void> {
    
    const timestamp = createdAt.getTime();
    
    await this.prisma.feedItem.create({
      data: {
        userId: authorId,
        postId,
        authorId,
        createdAt,
      },
    });
    
    await this.timelineService.addPostToTimeline(authorId, postId, timestamp);

    if (isCelebrity) {
      this.logger.log(`Skipping fanout enqueue for post ${postId} (Author is a celebrity)`);
      return;
    }

    
    await this.fanoutQueue.add(
      'fanout',
      { authorId, postId, timestamp },
      { 
        jobId: `fanout-${postId}`, 
        removeOnComplete: 100,     
        removeOnFail: 500,
      }
    );

    this.logger.log(`Enqueued fanout job for post ${postId}`);
  }

  async getPostById(postId: string, requestingUserId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: getPostSelect(requestingUserId),
    });
    if (!post) throw new NotFoundException('Post not found');
    return mapPost(post);
  }

  async getUserPosts(userId: string, requestingUserId: string, query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id, createdAt } = decodeCursor(query.cursor);
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ],
      };
    }

    const posts = await this.prisma.post.findMany({
      where: { authorId: userId, isDeleted: false, ...cursorWhere },
      select: getPostSelect(requestingUserId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = posts.length > limit;
    const items = hasNextPage ? posts.slice(0, limit) : posts;
    const mappedItems = items.map(mapPost);
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items: mappedItems, nextCursor, hasNextPage };
  }

  async deletePost(postId: string, requesterId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== requesterId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    
    await this.prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true },
    });

    return { message: 'Post deleted' };
  }

  async likePost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Already liked this post');

    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId, postId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    return { message: 'Post liked' };
  }

  async unlikePost(userId: string, postId: string) {
    const like = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { id: true },
    });
    if (!like) throw new NotFoundException('Like not found');

    await this.prisma.$transaction([
      this.prisma.like.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);

    return { message: 'Post unliked' };
  }

  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: { content: dto.content, userId, postId, imageUrl: dto.imageUrl },
        select: {
          id: true,
          content: true,
          imageUrl: true,
          createdAt: true,
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);

    return comment;
  }

  async getComments(postId: string, query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    let cursorWhere = {};

    if (query.cursor) {
      const { id, createdAt } = decodeCursor(query.cursor);
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: id } },
        ],
      };
    }

    const comments = await this.prisma.comment.findMany({
      where: { postId, isDeleted: false, ...cursorWhere },
      select: {
        id: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = comments.length > limit;
    const items = hasNextPage ? comments.slice(0, limit) : comments;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null;

    return { items, nextCursor, hasNextPage };
  }
}
