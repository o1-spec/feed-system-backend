import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FeedService } from './feed.service.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Feed')
@ApiBearerAuth()
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the authenticated user home feed',
    description: 'Returns cursor-paginated posts from users the authenticated user follows.',
  })
  getHomeFeed(@CurrentUser('id') userId: string, @Query() query: FeedQueryDto) {
    return this.feedService.getHomeFeed(userId, query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a public user timeline (their posts)' })
  @ApiParam({ name: 'id', description: 'User ID whose timeline to fetch' })
  getUserTimeline(@Param('id') userId: string, @Query() query: FeedQueryDto) {
    return this.feedService.getUserTimeline(userId, query);
  }
}
