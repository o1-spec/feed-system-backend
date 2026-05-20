# Feed System Backend - Complete Architecture Guide

## 📋 Executive Summary

This is a **high-performance, scalable social media feed system** modeled after Twitter/X and Instagram. It's engineered to handle:
- **Massive follower fanout** (solving the "Justin Bieber Problem")
- **Sub-millisecond feed retrieval** through intelligent caching
- **Distributed asynchronous processing** via BullMQ workers
- **Eventual consistency** through hybrid push/pull architecture

---

## 🏗️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | NestJS (TypeScript) |
| **Database** | PostgreSQL (Prisma ORM) |
| **Cache Layer** | Redis (Sorted Sets for timelines) |
| **Job Queue** | BullMQ (asynchronous workers) |
| **Authentication** | JWT (Access + Refresh tokens) |
| **Containerization** | Docker & Docker Compose |
| **Media Upload** | Cloudinary |

---

## 🗂️ Project Structure

```
src/
├── main.ts                          # Entry point, Swagger setup
├── app.module.ts                    # Root module, global middleware setup
├── app.controller.ts / app.service.ts
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts    # @CurrentUser() - Extract JWT user
│   │   └── public.decorator.ts          # @Public() - Bypass JWT guard
│   ├── filters/
│   │   └── global-exception.filter.ts   # Centralized error handling
│   ├── guards/
│   │   └── jwt-auth.guard.ts            # JWT validation guard
│   └── interceptors/
│       ├── logging.interceptor.ts       # Request/response logging
│       └── transform.interceptor.ts     # Response wrapping
│
├── config/
│   └── configuration.ts             # Environment variables config
│
└── modules/                         # Feature modules
    ├── auth/                        # Registration, login, token refresh
    ├── users/                       # Profiles, follow/unfollow
    ├── posts/                       # Post CRUD, likes, comments
    ├── feed/                        # Home feed with hybrid weight system
    ├── timeline/                    # Redis sorted set operations
    ├── bookmarks/                   # Save posts (user preferences)
    ├── messages/                    # Direct messaging
    ├── upload/                      # File upload to Cloudinary
    ├── prisma/                      # Database service
    ├── redis/                       # Redis client
    └── workers/fanout/              # Background fanout jobs
```

---

## 📊 Database Schema

### Core Models

#### 1. **User**
```
id: String (CUID)
username: String @unique
email: String @unique
passwordHash: String
displayName: String?
bio: String?
avatarUrl: String?
coverUrl: String?
followerCount: Int (denormalized)
followingCount: Int (denormalized)
isCelebrity: Boolean (flags high-follower accounts)
refreshToken: String? (stored for token invalidation)
createdAt: DateTime
updatedAt: DateTime
```

#### 2. **Post**
```
id: String (CUID)
content: String
imageUrl: String?
authorId: String (FK -> User)
likesCount: Int (denormalized)
commentsCount: Int (denormalized)
isDeleted: Boolean (soft delete)
createdAt: DateTime
updatedAt: DateTime

Indexes:
- (authorId, createdAt DESC) - User timeline
- (createdAt DESC) - Global posts
```

#### 3. **Follow**
```
id: String (CUID)
followerId: String (FK -> User)
followingId: String (FK -> User)
createdAt: DateTime

Constraints:
- @unique([followerId, followingId]) - Prevent duplicates
```

#### 4. **Like**
```
id: String (CUID)
userId: String (FK -> User)
postId: String (FK -> Post)
createdAt: DateTime

Constraints:
- @unique([userId, postId]) - Idempotent likes
```

#### 5. **Comment**
```
id: String (CUID)
content: String
imageUrl: String?
userId: String (FK -> User)
postId: String (FK -> Post)
isDeleted: Boolean (soft delete)
createdAt: DateTime
updatedAt: DateTime

Index: (postId, createdAt DESC) - Hierarchical comments
```

#### 6. **FeedItem**
```
id: String (CUID)
userId: String (FK -> User) - Timeline owner
postId: String (FK -> Post) - The post content
authorId: String (FK -> User) - Post creator
createdAt: DateTime

Purpose: Stores denormalized feed entries in PostgreSQL
```

#### 7. **Bookmark**
```
userId: String (FK -> User)
postId: String (FK -> Post)
createdAt: DateTime

Purpose: User saves posts for later
```

#### 8. **Message**
```
id: String (CUID)
senderId: String (FK -> User)
receiverId: String (FK -> User)
content: String
createdAt: DateTime

Purpose: Direct messaging between users
```

#### 9. **Notification**
```
id: String (CUID)
userId: String (FK -> User) - Notification recipient
actorId: String (FK -> User) - Who triggered notification
type: NotificationType (FOLLOW, LIKE, COMMENT, MENTION)
postId: String? (reference to post, if applicable)
isRead: Boolean
createdAt: DateTime
```

---

## 🔄 Core Architecture Patterns

### 1. **Hybrid Push/Pull Feed System**

#### The Problem
When a celebrity with 10M followers posts, traditional "fanout-on-write" creates:
- 10M database writes immediately
- Massive write bottleneck
- API response delayed 2-5 seconds

#### The Solution: Weight-Based Multi-Layer Feed

The home feed merges posts from THREE sources with priority weights:

**WEIGHT 1 (Highest Priority):** Posts from followers of the user
- These are **pushed** to the follower's FeedItem during fanout
- Retrieved immediately from Redis timeline cache

**WEIGHT 2 (Medium):** Posts from celebrities (high follower count)
- **NOT fanout-written** to avoid write explosion
- **Pulled at read-time** directly from PostgreSQL
- Criteria: `user.followerCount >= CELEBRITY_THRESHOLD` (default: 10,000)

**WEIGHT 3 (Lowest):** Posts from followers of the user's followers
- Retrieved from PostgreSQL with secondary sorting
- Creates "friend-of-friend" discovery

**Algorithm in `feed.service.ts`:**
```typescript
async getHomeFeed(userId: string, query: FeedQueryDto) {
  // 1. Get user's following/follower lists
  const followingIds = await getFollowing(userId);
  const followerIds = await getFollowers(userId);
  
  // 2. Fetch Weight 2 (followed users & celebrities)
  const followedPosts = await prisma.post.findMany({
    where: { authorId: { in: followingIds }, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  
  // 3. Fetch Weight 3 (celebrities the user follows)
  const celebrityPosts = await prisma.post.findMany({
    where: {
      authorId: { in: followingIds },
      author: { isCelebrity: true }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  // 4. Merge and sort by weight + timestamp
  return mergeByWeight(followedPosts, celebrityPosts);
}
```

---

### 2. **Fanout-on-Write with Background Jobs**

When a **non-celebrity** user creates a post:

**Step 1: Immediate Operations** (in `posts.service.ts`)
```typescript
async createPost(authorId: string, dto: CreatePostDto) {
  // 1. Create post in PostgreSQL
  const post = await prisma.post.create({ ... });
  
  // 2. Add to author's own feed
  await prisma.feedItem.create({
    userId: authorId,
    postId: post.id,
    authorId
  });
  
  // 3. Add to author's Redis timeline cache
  await timelineService.addPostToTimeline(authorId, postId, timestamp);
  
  // 4. If NOT celebrity: Queue background fanout job
  if (!post.author.isCelebrity) {
    await fanoutQueue.add('fanout', {
      authorId,
      postId,
      timestamp: post.createdAt.getTime()
    });
  }
  
  return post;  // Response ~20ms (before fanout completes)
}
```

**Step 2: Background Fanout** (in `fanout.processor.ts`)
```typescript
async process(job: Job<FanoutJobData>) {
  const { authorId, postId, timestamp } = job.data;
  
  // Chunk into batches of 500 to avoid memory issues
  let skip = 0;
  while (true) {
    const followers = await prisma.follow.findMany({
      where: { followingId: authorId },
      take: 500,
      skip: skip
    });
    
    if (followers.length === 0) break;
    
    // Bulk insert all FeedItems
    await prisma.feedItem.createMany({
      data: followers.map(f => ({
        userId: f.followerId,
        postId,
        authorId,
        createdAt: new Date(timestamp)
      }))
    });
    
    // Parallel: Add to each follower's Redis timeline
    await Promise.all(
      followers.map(f => 
        timelineService.addPostToTimeline(f.followerId, postId, timestamp)
      )
    );
    
    skip += 500;
  }
}
```

**Benefits:**
- API returns in ~20ms (before expensive fanout)
- Database writes distributed over time
- Follows are processed in batches (500 chunks)
- Two levels of caching: PostgreSQL + Redis

---

### 3. **Redis Timeline Cache (L1 Cache)**

Located in `timeline.service.ts`:

```typescript
// Redis key: timeline:${userId}
// Type: Sorted Set (score = timestamp, member = postId)

async addPostToTimeline(userId: string, postId: string, timestamp: number) {
  const key = `timeline:${userId}`;
  
  // Atomic pipeline operation
  await redis
    .pipeline()
    .zadd(key, timestamp, postId)           // Add post
    .zremrangebyrank(key, 0, -(SIZE + 1))   // Trim to keep SIZE items
    .exec();
}

// Retrieve posts from Redis (O(log N + M) operation)
async getTimeline(userId: string, cursor?: number, limit = 20) {
  const key = `timeline:${userId}`;
  
  // Query reverse range (newest first)
  // cursor = exclusive score boundary
  const maxScore = cursor ? `(${cursor}` : '+inf';
  return redis.zrevrangebyscore(key, maxScore, '-inf', 'LIMIT', 0, limit);
}
```

**Cache Strategy:**
- Keeps **1000 most recent posts** per user (configurable)
- Used for **follows only** (not celebrities)
- Fallback: If cache empty, query PostgreSQL
- TTL: Posts stay in cache forever unless trimmed by new posts
- Sub-millisecond retrieval for cached posts

---

### 4. **Cursor-Based Pagination**

All list endpoints use **opaque base64 cursors** for pagination:

```typescript
// Encoding cursor
function encodeCursor(id: string, createdAt: Date, weight?: number): string {
  return Buffer.from(
    JSON.stringify({ id, createdAt: createdAt.toISOString(), weight })
  ).toString('base64');
}

// Decoding cursor
function decodeCursor(cursor: string) {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
}

// Usage in queries
const decoded = decodeCursor(query.cursor);
const posts = await prisma.post.findMany({
  where: {
    OR: [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } }
    ]
  },
  take: limit
});

// Return next cursor in response
const nextCursor = encodeCursor(posts[posts.length - 1].id, posts[posts.length - 1].createdAt);
```

**Why Cursors?**
- Gracefully handles concurrent inserts (offset-based fails)
- Opaque encoding hides database implementation
- Includes timestamp + ID for stable sorting

---

## 🔐 Authentication Flow

### Registration
```
POST /api/v1/auth/register
├─ Validate input (email, username, password format)
├─ Hash password with bcrypt (12 rounds)
├─ Create User in PostgreSQL
├─ Generate JWT pair (access + refresh)
├─ Store refresh token hash in user.refreshToken
└─ Return user + tokens
```

### Login
```
POST /api/v1/auth/login
├─ Find user by email
├─ Validate password hash (bcrypt compare)
├─ Generate JWT pair
├─ Store refresh token hash
└─ Return tokens
```

### JWT Structure
```
Access Token (15m expiry):
{
  sub: userId,
  username: "...",
  email: "...",
  iat: ...,
  exp: ...
}

Refresh Token (7d expiry):
{
  sub: userId,
  type: "refresh",
  iat: ...,
  exp: ...
}
```

### Token Validation
```typescript
// JwtAuthGuard applied globally
@UseGuards(JwtAuthGuard)
```

Checks:
1. Bearer token exists in Authorization header
2. Signature is valid (using JWT_ACCESS_SECRET)
3. Token not expired
4. Extracts userId and injects via @CurrentUser() decorator

### Public Routes
Bypass JWT validation using `@Public()` decorator:
```typescript
@Post('register')
@Public()
async register(@Body() dto: RegisterDto) { ... }
```

---

## 📡 Key Modules Overview

### 1. **Auth Module** (`auth/`)
**Responsibilities:**
- User registration with password hashing
- Login with JWT token generation
- Token refresh mechanism
- Logout (token invalidation)

**Key Files:**
- `auth.service.ts` - Core auth logic
- `auth.controller.ts` - Route handlers
- `jwt.strategy.ts` - JWT validation strategy
- DTOs: `register.dto.ts`, `login.dto.ts`

---

### 2. **Users Module** (`users/`)
**Responsibilities:**
- User profile management
- Follow/unfollow system
- User search and discovery
- Denormalized follower/following counters

**Key Features:**
- Celebrity detection (follower count threshold)
- Profile update (bio, avatar, etc.)
- Follow operations with transaction safety
- Follower/following lists with pagination

**Key Files:**
- `users.service.ts` - Profile & follow logic
- `users.controller.ts` - Routes

---

### 3. **Posts Module** (`posts/`)
**Responsibilities:**
- Post CRUD operations
- Like system (idempotent)
- Comment system (hierarchical)
- Fanout job queuing

**Key Features:**
- Soft delete (posts marked `isDeleted` instead of removed)
- Denormalized like/comment counts
- Idempotent likes (unique constraint)
- Automatic fanout queuing for non-celebrities

**Key Files:**
- `posts.service.ts` - Post, like, comment logic
- `posts.controller.ts` - Routes

---

### 4. **Feed Module** (`feed/`)
**Responsibilities:**
- Home feed retrieval with multi-weight algorithm
- User timeline retrieval
- Feed merging logic

**Algorithm:**
1. Weight 2 (Highest): Followed users + celebrities
2. Weight 3: Celebrity followers
3. Sorted by timestamp, cursor-paginated

**Key Files:**
- `feed.service.ts` - Feed logic with weight system
- `feed.controller.ts` - Routes

---

### 5. **Timeline Module** (`timeline/`)
**Responsibilities:**
- Redis sorted set operations
- Cache management for post timelines
- Trim logic for cache size limits

**Operations:**
- `addPostToTimeline()` - Add post to sorted set
- `getTimeline()` - Query cached posts
- `removePostFromTimeline()` - Delete post from cache
- `isTimelineCached()` - Check if user has cached posts

**Key Files:**
- `timeline.service.ts` - Redis operations

---

### 6. **Fanout Worker Module** (`workers/fanout/`)
**Responsibilities:**
- Background job processing
- Bulk FeedItem insertion
- Timeline cache population
- Chunked follower processing

**Job Data:**
```typescript
{
  authorId: string;
  postId: string;
  timestamp: number;
}
```

**Processing:**
- Fetches followers in chunks (500 per batch)
- Creates FeedItems in bulk
- Updates Redis timelines in parallel
- Logs total fanned-out count

**Key Files:**
- `fanout.processor.ts` - BullMQ job handler
- `fanout.module.ts` - Module setup

---

### 7. **Bookmarks Module** (`bookmarks/`)
**Responsibilities:**
- Save posts for later
- Bookmark management
- Bookmarked posts list

**Operations:**
- `bookmarkPost()` - Save post (conflict if already saved)
- `unbookmarkPost()` - Remove bookmark
- `getBookmarkedPosts()` - List saved posts (cursor-paginated)

**Key Files:**
- `bookmarks.service.ts` - Bookmark logic

---

### 8. **Messages Module** (`messages/`)
**Responsibilities:**
- Direct messaging between users
- Conversation retrieval
- Message history

**Features:**
- Prevent self-messaging
- Validate receiver exists
- Chronological ordering
- Conversation deduplication

**Key Files:**
- `messages.service.ts` - Messaging logic

---

### 9. **Prisma Module** (`prisma/`)
**Responsibilities:**
- PostgreSQL connection management
- Client initialization
- Graceful shutdown

**Key Files:**
- `prisma.service.ts` - Singleton connection handler

---

### 10. **Redis Module** (`redis/`)
**Responsibilities:**
- Redis client initialization
- Connection pooling
- Global Redis provider

**Key Files:**
- `redis.service.ts` - Redis operations

---

## 🔌 Global Middleware & Interceptors

### Decorators

#### `@CurrentUser()`
Extracts authenticated user ID from JWT:
```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile(@CurrentUser() userId: string) {
  // userId automatically injected
}
```

#### `@Public()`
Marks route as public (bypasses JWT guard):
```typescript
@Post('register')
@Public()
register(@Body() dto: RegisterDto) { ... }
```

---

### Guards

#### `JwtAuthGuard`
Applied globally via `APP_GUARD`:
- Validates bearer token
- Extracts JWT payload
- Skips public routes
- Attaches user to request

---

### Interceptors

#### `LoggingInterceptor`
Logs incoming requests and outgoing responses:
```
[Request] POST /api/v1/posts (userId: abc123)
[Response] 201 Created (15ms)
```

#### `TransformInterceptor`
Wraps all responses in standard format:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-05-19T..."
}
```

---

### Filters

#### `GlobalExceptionFilter`
Centralized error handling:
- Catches all exceptions
- Transforms to HTTP response
- Logs errors
- Returns consistent error format:
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Email already taken",
  "statusCode": 409,
  "timestamp": "2026-05-19T..."
}
```

---

## 🚀 Request/Response Lifecycle

### Example: Create a Post

**Request:**
```
POST /api/v1/posts HTTP/1.1
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "content": "Hello world!",
  "imageUrl": "https://..."
}
```

**Processing:**
1. `JwtAuthGuard` validates token
2. `LoggingInterceptor` logs request
3. `PostsController` validates DTO
4. `PostsService.createPost()` executes:
   - Creates post in PostgreSQL
   - Adds to author's feed + Redis cache
   - Queues fanout job (non-celebrities only)
5. Returns immediately (~20ms)
6. `TransformInterceptor` wraps response
7. `LoggingInterceptor` logs response

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "content": "Hello world!",
    "imageUrl": "https://...",
    "likesCount": 0,
    "commentsCount": 0,
    "createdAt": "2026-05-19T...",
    "author": {
      "id": "xyz789",
      "username": "johndoe",
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "isCelebrity": false
    }
  },
  "timestamp": "2026-05-19T..."
}
```

**Background:**
- Fanout worker processes followers asynchronously
- Bulk-inserts FeedItems
- Updates Redis timelines in batches

---

## 📊 Data Flow Diagrams

### Post Creation (Non-Celebrity)
```
┌─────────────────────────────────────────────────────────┐
│ User Creates Post                                       │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ Validate & Create   │
        │ Post in PostgreSQL  │
        └─────────┬───────────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
   ┌──────────────┐   ┌──────────────────────┐
   │ Add to own   │   │ Queue Background Job │
   │ FeedItem +   │   │ (Fanout)             │
   │ Redis Cache  │   └──────────┬───────────┘
   └──────────────┘              │
         │                        │
         ▼                        ▼
    ┌──────────────┐        [Background Worker]
    │ Return 201   │        Fetch followers (500/batch)
    │ (~20ms)      │        ├─ Insert FeedItems
    └──────────────┘        ├─ Update Redis timelines
                            └─ Log completion
```

### Feed Retrieval
```
┌──────────────────────────────────────────────┐
│ User Requests Home Feed                      │
└──────────┬───────────────────────────────────┘
           │
           ▼
  ┌────────────────────┐
  │ Get User's         │
  │ Following/Follower │
  │ Lists              │
  └────────┬───────────┘
           │
    ┌──────┴────────┐
    │               │
    ▼               ▼
┌─────────────┐  ┌────────────────────┐
│ Weight 2:   │  │ Weight 3:          │
│ Following + │  │ Celebrity Followers│
│ Celebrities │  │ (Read from DB)     │
└─────────────┘  └────────────────────┘
    │                    │
    └────────┬───────────┘
             │
             ▼
    ┌─────────────────────┐
    │ Merge by Weight +   │
    │ Sort by Timestamp   │
    │ (Cursor Pagination) │
    └─────────┬───────────┘
              │
              ▼
        ┌──────────────┐
        │ Return 200   │
        │ (Wrapped)    │
        └──────────────┘
```

---

## ⚙️ Configuration

Located in `src/config/configuration.ts`:

```typescript
export default () => ({
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL,
  },
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  
  feed: {
    celebrityThreshold: parseInt(process.env.CELEBRITY_THRESHOLD || '10000'),
    timelineCacheSize: parseInt(process.env.TIMELINE_CACHE_SIZE || '1000'),
  },
  
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
});
```

---

## 🧪 Testing & Development

### Running the Application
```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start development server (with HMR)
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

### API Documentation
- **Swagger UI**: `http://localhost:3000/api/docs`
- All routes documented with request/response schemas
- Bearer token support for authentication

### Testing
```bash
npm test                # Run unit tests
npm test:watch         # Watch mode
npm test:cov           # Coverage report
npm run test:e2e       # End-to-end tests
```

---

## 🎯 Key Design Decisions

### 1. **Denormalized Counters**
- `User.followerCount`, `User.followingCount`
- `Post.likesCount`, `Post.commentsCount`
- **Why**: Instant counter display without aggregation queries
- **Trade-off**: Keep in sync with actual records (transactions handle this)

### 2. **Soft Deletes**
- `Post.isDeleted`, `Comment.isDeleted` boolean flags
- **Why**: Preserve post history, allow undeletion, avoid cascading
- **Trade-off**: Queries must filter `isDeleted: false`

### 3. **Celebrity Bypass**
- High-follower users skip fanout-on-write
- **Why**: Prevents write explosion for popular accounts
- **Trade-off**: Slight latency increase for celebrity followers (pull-time merge)

### 4. **Redis Sorted Sets**
- Score = timestamp, member = postId
- **Why**: O(log N) insertions, natural reverse ordering
- **Trade-off**: Stores IDs only (still need DB lookups for post content)

### 5. **Cursor Pagination**
- Opaque base64-encoded cursors
- **Why**: Handles concurrent inserts gracefully
- **Trade-off**: Cannot jump to arbitrary page (must paginate sequentially)

---

## 📈 Scalability Characteristics

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Create Post (non-celebrity) | O(1) | Async fanout, ~20ms return |
| Create Post (celebrity) | O(1) | Skips fanout entirely |
| Get Home Feed | O(F log N) | F=following count, N=post count |
| Get User Timeline | O(log N + M) | Redis sorted set query |
| Follow/Unfollow | O(1) | Unique constraint prevents duplicates |
| Like Post | O(1) | Idempotent, atomic counter update |
| Background Fanout | O(followers/chunk) | Processes in 500-follower batches |

---

## 🔍 Monitoring & Debugging

### Logs
- All services use NestJS `Logger`
- Fanout jobs log completion count
- Auth logs user registration/login events

### Queries
- Use Prisma Studio for data inspection:
  ```bash
  npx prisma studio
  ```
- Monitor Redis with:
  ```bash
  redis-cli
  > KEYS timeline:*
  > ZCARD timeline:userId
  ```

### Performance Tips
1. Monitor Redis memory usage (timeline cache grows with users)
2. Adjust `CELEBRITY_THRESHOLD` based on your user base
3. Tune `TIMELINE_CACHE_SIZE` for memory vs latency trade-offs
4. Monitor BullMQ job queue length (backpressure indicator)

---

## 🎓 Learning Path

### To Understand the Codebase:
1. **Start with**: `main.ts` (entry point)
2. **Then**: `app.module.ts` (module imports)
3. **Next**: `auth/` module (simplest, understand JWT flow)
4. **Then**: `users/` module (social graph operations)
5. **Next**: `posts/` module (fanout job queuing)
6. **Then**: `feed/` module (complex multi-weight algorithm)
7. **Finally**: `workers/fanout/` (background processing)

### Key Concepts to Master:
- ✅ NestJS modules and dependency injection
- ✅ JWT authentication and token strategies
- ✅ Prisma ORM and database relationships
- ✅ Redis data structures (sorted sets)
- ✅ BullMQ job processing
- ✅ Cursor-based pagination
- ✅ Async/await patterns

---

## 📚 Additional Resources

- **README.md**: Setup & local development
- **API_DOCUMENTATION.md**: Detailed endpoint reference
- **Prisma Schema**: `prisma/schema.prisma` (database structure)
- **Docker Compose**: `docker-compose.yml` (containerized setup)

---

*This application represents a production-ready, scalable social media feed system designed for massive scale while maintaining low-latency response times.*
