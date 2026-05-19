# News Feed System - API Documentation

All successful responses in this API are automatically wrapped inside a standard payload format by a global `TransformInterceptor`:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-05-19T07:11:16.490Z"
}
```

---

## 🔒 1. Authentication (`/auth`)

Public routes do not require any headers. Guarded routes require a valid JWT bearer token in the `Authorization` header: `Authorization: Bearer <your_access_token>`.

### Register User
* **Method & Route:** `POST /api/v1/auth/register`
* **Security:** `Public`
* **Request Body (`RegisterDto`):**
  ```json
  {
    "username": "johndoe",
    "email": "john@domain.dev",
    "password": "Password123!",
    "displayName": "John Doe",
    "bio": "Back-end systems architect.",
    "avatarUrl": "https://api.dicebear.com/7.x/adventurer/svg?seed=John"
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "cl...",
        "username": "johndoe",
        "email": "john@domain.dev",
        "displayName": "John Doe",
        "bio": "Back-end systems architect.",
        "avatarUrl": "...",
        "followerCount": 0,
        "followingCount": 0,
        "isCelebrity": false,
        "createdAt": "..."
      },
      "tokens": {
        "accessToken": "...",
        "refreshToken": "..."
      }
    }
  }
  ```

### Log In
* **Method & Route:** `POST /api/v1/auth/login`
* **Security:** `Public`
* **Request Body (`LoginDto`):**
  ```json
  {
    "email": "john@domain.dev",
    "password": "Password123!"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "user": { ... },
      "tokens": {
        "accessToken": "...",
        "refreshToken": "..."
      }
    }
  }
  ```

### Refresh Token Pair
* **Method & Route:** `POST /api/v1/auth/refresh`
* **Security:** Requires **Refresh Token** passed in authorization header.
* **Request Body (`RefreshTokenDto`):**
  ```json
  {
    "refreshToken": "..."
  }
  ```
* **Success Response (200 OK):** Returns fresh JWT pair.

### Log Out
* **Method & Route:** `POST /api/v1/auth/logout`
* **Security:** `@ApiBearerAuth()`
* **Success Response (200 OK):** `{ "success": true, "data": { "message": "Logged out successfully" } }`

---

## 👤 2. User Profiles (`/users`)

All routes require `Authorization: Bearer <token>`.

### Get Authenticated User Profile
* **Method & Route:** `GET /api/v1/users/me`
* **Success Response (200 OK):** Returns the caller's complete profile object.

### Update Profile
* **Method & Route:** `PATCH /api/v1/users/me`
* **Request Body (`UpdateUserDto`):** (All fields optional)
  ```json
  {
    "displayName": "John D.",
    "bio": "Lead Cloud Infrastructure Engineer",
    "avatarUrl": "..."
  }
  ```

### Get Suggested Users
* **Method & Route:** `GET /api/v1/users/suggested?limit=5`
* **Success Response (200 OK):** Lists user suggestions based on who the active user does not follow.

### Search Profiles
* **Method & Route:** `GET /api/v1/users/search?q=john&limit=10`

### Get Public Profile
* **Method & Route:** `GET /api/v1/users/:id`

### Follow User
* **Method & Route:** `POST /api/v1/users/:id/follow`
* **Response:** `{ "success": true, "data": { "message": "Followed successfully" } }`
* **Side-effects:** Increments metrics and (if target is celebrity) triggers celebrity evaluation rules.

### Unfollow User
* **Method & Route:** `DELETE /api/v1/users/:id/follow`

### Get Followers List (Cursor-Paginated)
* **Method & Route:** `GET /api/v1/users/:id/followers?limit=20&cursor=...`

### Get Following List (Cursor-Paginated)
* **Method & Route:** `GET /api/v1/users/:id/following?limit=20&cursor=...`

---

## 📝 3. Posts & Interactions (`/posts`)

### Create a Post
* **Method & Route:** `POST /api/v1/posts`
* **Request Body (`CreatePostDto`):**
  ```json
  {
    "content": "Just deployed NestJS with Redis Sorted Sets timeline caches! ⚡🚀"
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "cl...",
      "content": "...",
      "authorId": "...",
      "likesCount": 0,
      "commentsCount": 0,
      "createdAt": "..."
    }
  }
  ```
* **Background Worker:** Enqueues a write-fanout job in BullMQ to distribute standard post items into followers' feed item indexes.

### Retrieve Post
* **Method & Route:** `GET /api/v1/posts/:id`

### Soft-Delete Post
* **Method & Route:** `DELETE /api/v1/posts/:id`

### Like Post
* **Method & Route:** `POST /api/v1/posts/:id/like`

### Unlike Post
* **Method & Route:** `DELETE /api/v1/posts/:id/like`

### Comment on Post
* **Method & Route:** `POST /api/v1/posts/:id/comments`
* **Request Body (`CreateCommentDto`):** `{ "content": "Absolutely amazing implementation details!" }`

### Get Comments (Cursor-Paginated)
* **Method & Route:** `GET /api/v1/posts/:id/comments?limit=10&cursor=...`

---

## ⚡ 4. Feed & Timelines (`/feed`)

The timelines support high-performance cursor pagination with Base64 encoded cursors.

### Retrieve Home Feed (Timeline)
* **Method & Route:** `GET /api/v1/feed?limit=20&cursor=...`
* **Under the Hood (Hybrid Retrieval Strategy):**
  1. Pulls standard follow posts directly from **Redis Sorted Sets ZSET** caches (`timeline:${userId}`) with $O(\log N + M)$ speed.
  2. If ZSET experiences a cache miss, falls back to the PostgreSQL materialized relational `FeedItem` table.
  3. Identifies the user's followed accounts that are categorized as **Celebrities (`isCelebrity = true`)**.
  4. Dynamically queries the celebrity posts from PostgreSQL and merges them with standard posts chronologically in-memory.
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "cl...",
          "content": "...",
          "likesCount": 42,
          "commentsCount": 2,
          "createdAt": "...",
          "author": { "id": "...", "username": "...", "displayName": "...", "avatarUrl": "...", "isCelebrity": false }
        }
      ],
      "nextCursor": "eyJpZCI6ImNs...IsImNyZWF0ZWRBdCI6IjIwMjYt..." ,
      "hasNextPage": true,
      "meta": {
        "count": 1,
        "strategy": "redis-hybrid" // or "postgresql-hybrid"
      }
    }
  }
  ```

### Retrieve User Timeline
* **Method & Route:** `GET /api/v1/feed/users/:id?limit=20&cursor=...`
* **Description:** Retrieves the posts authored by a single user (for their profile page).

---

## 🔖 5. Bookmarks (`/bookmarks`)

Allows users to index and save posts they want to read later.

### Bookmark a Post
* **Method & Route:** `POST /api/v1/bookmarks/:postId`
* **Response (201 Created):** `{ "success": true, "data": { "id": "...", "userId": "...", "postId": "...", "createdAt": "..." } }`

### Remove Bookmark
* **Method & Route:** `DELETE /api/v1/bookmarks/:postId`

### Get Saved/Bookmarked Posts
* **Method & Route:** `GET /api/v1/bookmarks?limit=20&cursor=...`
* **Description:** Retrieves the caller's saved posts (ordered by most recently bookmarked first) using cursor-based pagination.

---

## 💬 6. Direct Communication Hub (`/messages`)

Enables real-time chronological developer chat threads.

### Send Message
* **Method & Route:** `POST /api/v1/messages`
* **Request Body (`CreateMessageDto`):**
  ```json
  {
    "receiverId": "cl...",
    "content": "Let's review the code changes at 3:00 PM."
  }
  ```

### Get Conversations Sidebar List
* **Method & Route:** `GET /api/v1/messages/conversations`
* **Description:** Returns all distinct partners the active session has chatted with, ordered by their most recent active message timestamp, complete with message previews.
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "partner": { "id": "...", "username": "...", "displayName": "...", "avatarUrl": "..." },
        "lastMessage": { "id": "...", "content": "Let's review the code...", "createdAt": "...", "senderId": "...", "receiverId": "..." }
      }
    ]
  }
  ```

### Get Chronological Conversation Logs
* **Method & Route:** `GET /api/v1/messages/conversation/:userId?limit=20&cursor=...`
* **Description:** Fetches chronological direct logs between caller and `:userId`. The items are returned sorted oldest-to-newest for instant client-side scroll rendering.
