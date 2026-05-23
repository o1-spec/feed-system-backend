import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { CreateCommentDto } from './dto/post-interaction.dto.js';
import { PaginationQueryDto } from '../users/dto/pagination-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new post' })
  @ApiResponse({ status: 201, description: 'Post created and fanned out to followers' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.createPost(userId, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search for posts by content' })
  search(@CurrentUser('id') userId: string, @Query('q') query: string, @Query('limit') limit?: string) {
    if (!query) return { items: [], nextCursor: null, hasNextPage: false };
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.postsService.searchPosts(query, userId, parsedLimit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single post by ID' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.postsService.getPostById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a post (author only)' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.updatePost(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a post (author only)' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.postsService.deletePost(id, userId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like a post' })
  @ApiResponse({ status: 409, description: 'Already liked' })
  like(@CurrentUser('id') userId: string, @Param('id') postId: string) {
    return this.postsService.likePost(userId, postId);
  }

  @Delete(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a post' })
  unlike(@CurrentUser('id') userId: string, @Param('id') postId: string) {
    return this.postsService.unlikePost(userId, postId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a post' })
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.addComment(userId, postId, dto);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get comments on a post (cursor paginated)' })
  getComments(@Param('id') postId: string, @Query() query: PaginationQueryDto) {
    return this.postsService.getComments(postId, query);
  }
}
