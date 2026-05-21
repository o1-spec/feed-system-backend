import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('suggested')
  @ApiOperation({ summary: 'Get suggested users' })
  getSuggested(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.usersService.getSuggested(userId, query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users' })
  searchUsers(
    @CurrentUser('id') userId: string,
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.search(userId, q, limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user public profile by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  getUser(@CurrentUser('id') activeUserId: string, @Param('id') id: string) {
    return this.usersService.findById(id, activeUserId);
  }

  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user' })
  @ApiResponse({ status: 200, description: 'Followed successfully' })
  @ApiResponse({ status: 409, description: 'Already following' })
  follow(@CurrentUser('id') followerId: string, @Param('id') followingId: string) {
    return this.usersService.follow(followerId, followingId);
  }

  @Delete(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(@CurrentUser('id') followerId: string, @Param('id') followingId: string) {
    return this.usersService.unfollow(followerId, followingId);
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'Get a user followers list (cursor paginated)' })
  getFollowers(@Param('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.usersService.getFollowers(userId, query);
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'Get a user following list (cursor paginated)' })
  getFollowing(@Param('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.usersService.getFollowing(userId, query);
  }
}
