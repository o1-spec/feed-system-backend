import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(senderId: string, dto: CreateMessageDto) {
    const { receiverId, content } = dto;

    if (senderId === receiverId) {
      throw new BadRequestException('You cannot send a message to yourself');
    }

    // 1. Verify recipient exists
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) {
      throw new NotFoundException('Recipient user not found');
    }

    // 2. Create the message record
    return this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        createdAt: true,
      },
    });
  }

  async getConversations(userId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isCelebrity: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isCelebrity: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversationMap = new Map<string, any>();
    for (const msg of messages) {
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!conversationMap.has(partner.id)) {
        conversationMap.set(partner.id, {
          partner,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
          },
        });
      }
    }

    return Array.from(conversationMap.values());
  }

  async getConversationThread(userId: string, partnerId: string, query: PaginationQueryDto) {
    // Verify partner exists
    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      throw new NotFoundException('Conversation partner not found');
    }

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

    const messages = await this.prisma.message.findMany({
      where: {
        AND: [
          {
            OR: [
              { senderId: userId, receiverId: partnerId },
              { senderId: partnerId, receiverId: userId },
            ],
          },
          cursorWhere,
        ],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNextPage = messages.length > limit;
    const items = hasNextPage ? messages.slice(0, limit) : messages;
    const last = items[items.length - 1];
    const nextCursor = hasNextPage && last ? this.encodeCursor(last.id, last.createdAt) : null;

    // Direct message logs are returned reversed (oldest-to-newest) for immediate rendering on frontend,
    // while backward pagination is correctly supported behind-the-scenes
    return {
      items: [...items].reverse(),
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
