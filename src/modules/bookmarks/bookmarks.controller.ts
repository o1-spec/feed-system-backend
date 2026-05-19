import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookmarksService } from './bookmarks.service.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Bookmarks')
@ApiBearerAuth()
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post(':postId')
  @ApiOperation({ summary: 'Bookmark a post' })
  @ApiParam({ name: 'postId', description: 'ID of the post to bookmark' })
  @ApiResponse({ status: 201, description: 'Post bookmarked successfully' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 409, description: 'Post already bookmarked' })
  bookmark(@CurrentUser('id') userId: string, @Param('postId') postId: string) {
    return this.bookmarksService.bookmarkPost(userId, postId);
  }

  @Delete(':postId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unbookmark/remove a post' })
  @ApiParam({ name: 'postId', description: 'ID of the post to unbookmark' })
  @ApiResponse({ status: 200, description: 'Bookmark removed successfully' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  unbookmark(@CurrentUser('id') userId: string, @Param('postId') postId: string) {
    return this.bookmarksService.unbookmarkPost(userId, postId);
  }

  @Get()
  @ApiOperation({ summary: 'Get authenticated user saved/bookmarked posts' })
  @ApiResponse({ status: 200, description: 'Saved posts retrieved successfully' })
  getBookmarks(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.bookmarksService.getBookmarkedPosts(userId, query);
  }
}
