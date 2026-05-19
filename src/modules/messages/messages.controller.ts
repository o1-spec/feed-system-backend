import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a direct message to another user' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 404, description: 'Recipient user not found' })
  @ApiResponse({ status: 400, description: 'Cannot send message to yourself' })
  sendMessage(@CurrentUser('id') userId: string, @Body() dto: CreateMessageDto) {
    return this.messagesService.sendMessage(userId, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get a list of unique conversations for active session' })
  @ApiResponse({ status: 200, description: 'Conversations list retrieved successfully' })
  getConversations(@CurrentUser('id') userId: string) {
    return this.messagesService.getConversations(userId);
  }

  @Get('conversation/:userId')
  @ApiOperation({ summary: 'Get chronological message logs between active user and specified user' })
  @ApiParam({ name: 'userId', description: 'ID of the user to retrieve conversations with' })
  @ApiResponse({ status: 200, description: 'Chronological conversation logs retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Conversation partner not found' })
  getConversationThread(
    @CurrentUser('id') userId: string,
    @Param('userId') partnerId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.messagesService.getConversationThread(userId, partnerId, query);
  }
}
