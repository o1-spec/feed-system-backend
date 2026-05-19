import { PrismaClient } from '../src/generated/prisma/client.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10; 
const CELEBRITY_THRESHOLD = 100;
const TIMELINE_CACHE_SIZE = 1000;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6383', 10),
});

const POST_TOPICS = [
  {
    topic: 'system_design',
    templates: [
      "Why we moved from fanout-on-write to a hybrid pull model for celebrity posts: write performance at scale is all about avoiding write-amplification bottlenecks.",
      "Redis Sorted Sets (ZSET) are incredibly fast for O(1) in-memory range queries. They allow sub-15ms timeline retrieves.",
      "Using BullMQ to distribute background jobs concurrently to prevent standard client request-response cycles from blocking.",
      "Single point of failure (SPOF) checklist: do you have automated failover for your primary PostgreSQL database, or are you hoping for the best?",
      "Optimizing database connection pool sizing: too large, and you exhaust database server processes; too small, and requests queue up.",
      "A developer's guide to horizontal partitioning: how we sharded our database tables by tenant ID to achieve linear scalability.",
      "Eventual consistency vs strong consistency. In social timelines, showing a post 3 seconds late is fine. Choose performance over rigid lock-steps."
    ]
  },
  {
    topic: 'engineering_startups',
    templates: [
      "Ship fast, iterate faster. In early-stage startups, perfect code in a drawer is worth less than slightly messy code deployed in production.",
      "Relational integrity via foreign keys is not 'unscalable'—it is the bedrock of database sanity. Don't push constraint checking entirely to the application layer.",
      "The best developers I know write clean, simple code. The worst developers I know build complex abstractions before they even understand the domain problem.",
      "Just deployed a NestJS server module. The structural MVC pattern and built-in guards make securing REST routes highly intuitive.",
      "Spent the morning debugging memory leaks in our background job workers. Turned out to be unclosed database connections in our thread pool.",
      "How to run a high-performing remote dev team: enforce strong async communication, well-documented APIs, and zero micromanagement.",
      "SaaS design tip: your pricing page should be dead simple. Over-complex tiered packages confuse buyers and hurt conversion rates."
    ]
  },
  {
    topic: 'learning_typescript',
    templates: [
      "Prisma v7's programmatic datasource config is clean. Allowing dynamic runtime connections outside schema.prisma is a massive developer experience win.",
      "Mastering TypeScript utility types: keyof, ReturnType, and Omit can save you thousands of lines of redundant interfaces.",
      "Learning to love strict compilation checks. Every time TS complains about an implicit 'any', it's saving us a potential production runtime crash.",
      "Next.js App Router and server-side components feel like a complete paradigm shift. Bundles are smaller, and page transitions are exceptionally snappy.",
      "Why standard password hashing rounds matter: a low work factor leaves your system vulnerable to high-speed offline dictionary attacks.",
      "Implementing custom class validators in NestJS to enforce structural schema integrity at the API gateway layer.",
      "Mastering PostgreSQL cursor-based pagination. Using base64 opaque cursors keeps queries index-friendly and scales infinitely."
    ]
  },
  {
    topic: 'micro_social',
    templates: [
      "Beautiful morning for a run before jumping into code. Fresh air is the best debugger.",
      "Coffee in hand, terminal open. Let's make some commits.",
      "Is it just me, or does fixing a complex bug on a Friday afternoon feel like winning a marathon?",
      "There is nothing more satisfying than deleting 200 lines of legacy code and replacing it with a clean, single-line utility.",
      "Always document your code like the next person maintaining it is a psychopath who knows where you live.",
      "Our test coverage just crossed 90%! Feeling extremely confident in our deployment pipeline today.",
      "Taking a break from scaling databases to work on our landing page styling. Ambient dark modes are incredibly satisfying to build."
    ]
  }
];

const COMMENT_TEMPLATES = [
  "Spot on! Completely agree with this approach.",
  "How do you handle Redis cache eviction when memory limit is hit?",
  "This is a massive time saver. Thanks for sharing!",
  "Excellent writeup! Could you elaborate on how you handle database connection pooling here?",
  "Agreed. Scaling ZSETs gets tricky when you have millions of active feeds.",
  "What is the average latency of the background fanout workers under high load?",
  "Nice layout! Did you use vanilla CSS or Tailwind here?",
  "Interesting approach. I usually default to active polling, but hybrid seems far more robust.",
  "Simple, elegant, and highly effective. Exactly how engineering should be.",
  "Does the BullMQ processor run on a separate container sandbox?",
  "This resolved a database bottleneck I was facing. Kudos!",
  "Could you share a schema snippet? I'm curious about the indexing setup."
];

function getRandomDate(daysBack: number): Date {
  const now = Date.now();
  const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomSubset<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

async function main() {
  console.log('🚀 Initiating database seeding script...');

  
  console.log('🧹 Clearing existing database data safely...');
  
  await prisma.feedItem.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.like.deleteMany({});
  await prisma.follow.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✨ Database cleared.');

  
  console.log('🧹 Clearing Redis timeline cache keys...');
  const keys = await redis.keys('timeline:*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`🗑️  Deleted ${keys.length} timeline cache keys from Redis.`);
  } else {
    console.log('🟢 Redis was already clean.');
  }

  
  console.log('🔐 Pre-computing password hash for seed velocity...');
  const COMMON_HASH = await bcrypt.hash('Password123!', BCRYPT_ROUNDS);
  console.log('🔑 Password hash ready.');

  
  console.log('👤 Seeding users...');
  
  
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@feed.dev',
      username: 'demo',
      passwordHash: COMMON_HASH,
      displayName: 'Demo User',
      bio: 'Standard test account for timelines.sys. Exploring local multi-threaded BullMQ worker pipelines and Redis sorted sets.',
      avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=demo',
      isCelebrity: false,
    }
  });

  
  const celebrityUser = await prisma.user.create({
    data: {
      email: 'celebrity@feed.dev',
      username: 'celebrity',
      passwordHash: COMMON_HASH,
      displayName: 'Celebrity Engineer',
      bio: 'Principal Architect of timelines.sys. I tweet about distributed systems, hyper-concurrency, and scalable fanout engines.',
      avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=celebrity',
      isCelebrity: true,
    }
  });

  
  const normalUsersData: any[] = [];
  const engineerRoles = ['Backend Developer', 'System Architect', 'Frontend Lead', 'DevOps Specialist', 'Fullstack Engineer', 'VP of Product', 'UX Engineer'];
  const engineerTechs = ['NestJS', 'TypeScript', 'Prisma', 'PostgreSQL', 'Redis', 'BullMQ', 'Docker', 'Kubernetes', 'Next.js', 'Go', 'Rust'];

  for (let i = 1; i <= 100; i++) {
    const username = `dev_user_${i}`;
    const role = pickRandom(engineerRoles);
    const tech = pickRandom(engineerTechs);
    normalUsersData.push({
      email: `dev_user_${i}@feed.dev`,
      username,
      passwordHash: COMMON_HASH,
      displayName: `Developer ${i}`,
      bio: `${role} specializing in ${tech}. Passionate about microservices, robust tests, and scalable software pipelines.`,
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
      isCelebrity: false,
    });
  }

  
  await prisma.user.createMany({
    data: normalUsersData,
  });

  const normalUsers = await prisma.user.findMany({
    where: {
      NOT: [
        { id: demoUser.id },
        { id: celebrityUser.id }
      ]
    }
  });

  console.log(`✅ Seeded ${normalUsers.length + 2} users (1 demo, 1 celebrity, ${normalUsers.length} mock normal users).`);

  
  console.log('🔗 Seeding follow relationships...');
  const followsToCreate: any[] = [];

  
  for (const user of normalUsers) {
    followsToCreate.push({
      followerId: user.id,
      followingId: celebrityUser.id,
    });
  }

  
  const demoFollowingCount = 25;
  const demoFollowees = pickRandomSubset(normalUsers, demoFollowingCount);
  for (const followee of demoFollowees) {
    followsToCreate.push({
      followerId: demoUser.id,
      followingId: followee.id,
    });
  }
  
  followsToCreate.push({
    followerId: demoUser.id,
    followingId: celebrityUser.id,
  });

  
  const demoFollowersSubset = pickRandomSubset(normalUsers, 5);
  for (const follower of demoFollowersSubset) {
    followsToCreate.push({
      followerId: follower.id,
      followingId: demoUser.id,
    });
  }

  
  
  for (let i = 0; i < normalUsers.length; i++) {
    const follower = normalUsers[i];
    for (let offset = 1; offset <= 4; offset++) {
      const followeeIdx = (i + offset) % normalUsers.length;
      const followee = normalUsers[followeeIdx];
      followsToCreate.push({
        followerId: follower.id,
        followingId: followee.id,
      });
    }
  }

  
  await prisma.follow.createMany({
    data: followsToCreate,
    skipDuplicates: true,
  });

  console.log(`✅ Seeded follows.`);

  
  console.log('📊 Synchronizing follower and following counts across profiles...');
  const users = await prisma.user.findMany({
    select: { id: true }
  });

  for (const u of users) {
    const followers = await prisma.follow.count({ where: { followingId: u.id } });
    const following = await prisma.follow.count({ where: { followerId: u.id } });

    await prisma.user.update({
      where: { id: u.id },
      data: {
        followerCount: followers,
        followingCount: following,
        
        isCelebrity: u.id === celebrityUser.id || followers >= CELEBRITY_THRESHOLD,
      }
    });
  }

  console.log('✅ Synchronized follower and following metrics.');

  
  console.log('📝 Seeding tech and social posts...');
  const postsToCreate: any[] = [];

  
  const celebrityPostTimes = [
    getRandomDate(0.2), 
    getRandomDate(1),   
    getRandomDate(2.5),
    getRandomDate(4),
    getRandomDate(6),
    getRandomDate(9),
    getRandomDate(12),
  ];

  celebrityPostTimes.forEach((time, index) => {
    postsToCreate.push({
      authorId: celebrityUser.id,
      content: pickRandom(POST_TOPICS[index % POST_TOPICS.length].templates),
      createdAt: time,
      updatedAt: time,
    });
  });

  
  const demoPostTimes = [
    getRandomDate(1.2),
    getRandomDate(3.5),
    getRandomDate(7),
  ];
  demoPostTimes.forEach((time, index) => {
    postsToCreate.push({
      authorId: demoUser.id,
      content: `[Demo timeline trace] ${pickRandom(POST_TOPICS[(index + 1) % POST_TOPICS.length].templates)}`,
      createdAt: time,
      updatedAt: time,
    });
  });

  
  for (const user of normalUsers) {
    const postCount = Math.floor(Math.random() * 3) + 5; 
    for (let p = 0; p < postCount; p++) {
      const date = getRandomDate(14); 
      const topic = pickRandom(POST_TOPICS);
      postsToCreate.push({
        authorId: user.id,
        content: pickRandom(topic.templates),
        createdAt: date,
        updatedAt: date,
      });
    }
  }

  
  const CHUNK_SIZE = 100;
  for (let i = 0; i < postsToCreate.length; i += CHUNK_SIZE) {
    const chunk = postsToCreate.slice(i, i + CHUNK_SIZE);
    await prisma.post.createMany({
      data: chunk,
    });
  }

  
  const allPosts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log(`✅ Seeded ${allPosts.length} posts across all users.`);

  
  console.log('❤️  Seeding likes and comments...');
  const likesToCreate: any[] = [];
  const commentsToCreate: any[] = [];

  
  const uniqueLikes = new Set<string>();

  
  const registerLike = (userId: string, postId: string) => {
    const pair = `${userId}_${postId}`;
    if (!uniqueLikes.has(pair)) {
      uniqueLikes.add(pair);
      likesToCreate.push({ userId, postId });
      return true;
    }
    return false;
  };

  
  const celebrityPosts = allPosts.filter(p => p.authorId === celebrityUser.id);
  const demoPosts = allPosts.filter(p => p.authorId === demoUser.id);
  const normalPosts = allPosts.filter(p => p.authorId !== celebrityUser.id);

  
  for (const post of celebrityPosts) {
    const likers = pickRandomSubset(normalUsers, Math.floor(Math.random() * 40) + 40); 
    for (const liker of likers) {
      registerLike(liker.id, post.id);
    }
    registerLike(demoUser.id, post.id);

    
    const commenters = pickRandomSubset(normalUsers, Math.floor(Math.random() * 5) + 3);
    for (const commenter of commenters) {
      commentsToCreate.push({
        postId: post.id,
        userId: commenter.id,
        content: pickRandom(COMMENT_TEMPLATES),
        createdAt: getRandomDate(4),
      });
    }
  }

  
  for (const post of normalPosts) {
    
    const likeCount = Math.floor(Math.random() * 7) + 2;
    const likers = pickRandomSubset([demoUser, ...normalUsers].filter(u => u.id !== post.authorId), likeCount);
    for (const liker of likers) {
      registerLike(liker.id, post.id);
    }

    
    if (Math.random() < 0.25) {
      const commenter = pickRandom([demoUser, ...normalUsers].filter(u => u.id !== post.authorId));
      commentsToCreate.push({
        postId: post.id,
        userId: commenter.id,
        content: pickRandom(COMMENT_TEMPLATES),
        createdAt: getRandomDate(7),
      });
    }
  }

  
  for (let i = 0; i < likesToCreate.length; i += CHUNK_SIZE) {
    const chunk = likesToCreate.slice(i, i + CHUNK_SIZE);
    await prisma.like.createMany({
      data: chunk,
    });
  }

  
  for (let i = 0; i < commentsToCreate.length; i += CHUNK_SIZE) {
    const chunk = commentsToCreate.slice(i, i + CHUNK_SIZE);
    await prisma.comment.createMany({
      data: chunk,
    });
  }

  console.log(`✅ Seeded ${likesToCreate.length} likes and ${commentsToCreate.length} comments.`);

  
  console.log('📊 Synchronizing likes and comments metrics on Post records...');
  const posts = await prisma.post.findMany({ select: { id: true } });
  for (const post of posts) {
    const likes = await prisma.like.count({ where: { postId: post.id } });
    const comments = await prisma.comment.count({ where: { postId: post.id } });
    await prisma.post.update({
      where: { id: post.id },
      data: {
        likesCount: likes,
        commentsCount: comments
      }
    });
  }
  console.log('✅ Synchronized post metrics.');

  
  console.log('🔔 Seeding high-fidelity notifications center records...');
  const notificationsToCreate: any[] = [];

  
  
  const demoFollowers = followsToCreate.filter(f => f.followingId === demoUser.id);
  for (const follow of demoFollowers.slice(0, 5)) {
    notificationsToCreate.push({
      userId: demoUser.id,
      actorId: follow.followerId,
      type: 'FOLLOW',
      isRead: false,
      createdAt: getRandomDate(2),
    });
  }

  
  for (const post of demoPosts) {
    const postLikes = likesToCreate.filter(l => l.postId === post.id);
    for (const like of postLikes.slice(0, 3)) {
      notificationsToCreate.push({
        userId: demoUser.id,
        actorId: like.userId,
        type: 'LIKE',
        postId: post.id,
        isRead: false,
        createdAt: getRandomDate(1),
      });
    }
  }

  
  await prisma.notification.createMany({
    data: notificationsToCreate,
  });

  console.log(`✅ Seeded ${notificationsToCreate.length} notification entries.`);

  
  console.log('🧩 Materializing relational FeedItem table (PostgreSQL timeline cache)...');
  
  
  const follows = await prisma.follow.findMany({});
  const followMap = new Map<string, string[]>(); 
  for (const f of follows) {
    if (!followMap.has(f.followerId)) {
      followMap.set(f.followerId, []);
    }
    followMap.get(f.followerId)!.push(f.followingId);
  }

  const feedItemsToCreate: any[] = [];

  for (const user of [demoUser, ...normalUsers]) {
    const followedIds = followMap.get(user.id) || [];
    if (followedIds.length === 0) continue;

    
    
    const followedPosts = allPosts.filter(p => 
      followedIds.includes(p.authorId) && p.authorId !== celebrityUser.id
    );

    
    const latestPosts = followedPosts.slice(0, 100);

    for (const post of latestPosts) {
      feedItemsToCreate.push({
        userId: user.id,
        postId: post.id,
        authorId: post.authorId,
        createdAt: post.createdAt,
      });
    }
  }

  
  for (let i = 0; i < feedItemsToCreate.length; i += CHUNK_SIZE) {
    const chunk = feedItemsToCreate.slice(i, i + CHUNK_SIZE);
    await prisma.feedItem.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`✅ Materialized ${feedItemsToCreate.length} FeedItem entries in PostgreSQL.`);

  
  console.log('⚡ Rebuilding Redis Sorted Sets timeline caches (timeline:{userId})...');

  let rebuiltRedisTimelinesCount = 0;

  for (const user of [demoUser, ...normalUsers]) {
    const followedIds = followMap.get(user.id) || [];
    
    
    const ownPosts = allPosts.filter(p => p.authorId === user.id);

    
    const followedPosts = allPosts.filter(p => 
      followedIds.includes(p.authorId) && p.authorId !== celebrityUser.id
    );

    const mergedFeedPosts = [...ownPosts, ...followedPosts];
    if (mergedFeedPosts.length === 0) continue;

    
    mergedFeedPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    
    const trimmedPosts = mergedFeedPosts.slice(0, TIMELINE_CACHE_SIZE);

    const timelineKey = `timeline:${user.id}`;
    const pipeline = redis.pipeline();

    for (const post of trimmedPosts) {
      pipeline.zadd(timelineKey, post.createdAt.getTime(), post.id);
    }

    
    await pipeline.exec();
    rebuiltRedisTimelinesCount++;
  }

  console.log(`✅ Rebuilt Redis timeline Sorted Sets for ${rebuiltRedisTimelinesCount} users.`);

  
  console.log('🔌 Shutting down client database and memory connections safely...');
  await prisma.$disconnect();
  await pool.end();
  await redis.quit();

  console.log('\n🌟 Seeding process successfully completed! 🌟');
  console.log('----------------------------------------------------');
  console.log('Demo Login Credentials:');
  console.log('👉 Username/Email: demo@feed.dev');
  console.log('👉 Password:       Password123!');
  console.log('\nCelebrity Test Account:');
  console.log('👉 Username/Email: celebrity@feed.dev');
  console.log('👉 Password:       Password123!');
  console.log('----------------------------------------------------\n');
}

main().catch((err) => {
  console.error('💥 Database seeding failed:', err);
  process.exit(1);
});
