# High-Performance News Feed System

A highly scalable, distributed News Feed Backend modeled after Twitter/X and Instagram. Engineered for low-latency feed retrieval, massive fanout distribution, and eventual consistency using a hybrid push/pull architecture.

## 🚀 Architecture Overview

This system utilizes a multi-tiered architecture to elegantly solve the "Justin Bieber Problem" (massive follower fanout):
- **PostgreSQL** serves as the primary source of truth, utilizing materialized `FeedItem` views.
- **Redis (Sorted Sets)** powers high-speed timeline caches (L1 cache) for sub-millisecond feed retrieval.
- **BullMQ** orchestrates asynchronous background workers, offloading the expensive fanout-on-write operations and dropping API response times to ~20ms.
- **Hybrid Fanout Strategy**: Automatically detects "Celebrity" accounts (massive followings) and dynamically bypasses the fanout queue, opting to merge their posts at read-time instead to prevent database write explosions.

## 🛠️ Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (Prisma ORM)
- **Caching & Queue**: Redis + BullMQ
- **Authentication**: JWT (Access + Refresh Tokens)
- **Containerization**: Docker & Docker Compose

## ✨ Core Features

- **Authentication**: Secure registration, login, and targeted session invalidation.
- **Social Graph**: Highly optimized follow/unfollow capabilities with denormalized counters.
- **Interactions**: Idempotent Likes and hierarchical Comments.
- **Saved Index (Bookmarks)**: Saved chronological developer post indexes.
- **Direct Messages**: Real-time chronological developer chat threads and conversation lists.

📖 **API Reference:** Detailed request/response payloads, auth structures, and queries are documented inside [API_DOCUMENTATION.md](file:///Users/macbook/feed-system-backend/API_DOCUMENTATION.md).
- **Scalable Feed**: Cursor-paginated (Opaque Base64 cursors) timeline retrieval that gracefully handles concurrent inserts.
- **Celebrity Routing**: Automated promotion of highly-followed accounts to optimize resource allocation.

## 📦 Local Development Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
- Node.js (v18 or v20+)
- Docker & Docker Compose
- PostgreSQL & Redis (if running locally without Docker)

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/news_feed?schema=public"
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
REDIS_HOST=localhost
REDIS_PORT=6379
CELEBRITY_THRESHOLD=10000
TIMELINE_CACHE_SIZE=1000
```

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Database Initialization
Apply Prisma migrations and generate the client:
```bash
npx prisma migrate dev --name init
```

### 5. Start the Application
Start the development server with Hot Module Replacement (HMR):
```bash
npm run start:dev
```
The API will be available at `http://localhost:3000/api/v1`.

### 6. API Documentation
Once the server is running, you can access the full interactive Swagger documentation at:
- **Swagger UI**: `http://localhost:3000/api/docs`

## 🧪 Background Workers
The background workers are automatically bootstrapped within the NestJS application context. They actively listen to the Redis-backed BullMQ `fanout` queue and process feed propagation asynchronously.

---
*Built for scale, engineered for speed.*
