import { PrismaClient } from '../src/generated/prisma/client.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const CELEBRITY_THRESHOLD = 300; // Adjust for larger dataset
const TIMELINE_CACHE_SIZE = 2000;

// Configuration for large-scale seeding (reduced for performance)
const TOTAL_USERS = 500; // Reduced from 1000 for faster seeding
const MOCK_NORMAL_USERS = 30; // Reduced from 50
const REGULAR_USERS = TOTAL_USERS - 3 - MOCK_NORMAL_USERS; // Subtract demo, celebrity, and mock users

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6383', 10),
  maxRetriesPerRequest: null,
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
      "Eventual consistency vs strong consistency. In social timelines, showing a post 3 seconds late is fine. Choose performance over rigid lock-steps.",
      "Circuit breakers, bulkheads, and retry policies. Essential patterns for building resilient microservices that don't cascade failures.",
      "Load shedding under extreme traffic spikes: gracefully rejecting requests is better than serving them slowly.",
      "Time-series databases vs relational databases: choosing the right tool for analytics and real-time event streaming.",
      "Implementing CQRS (Command Query Responsibility Segregation) to separate read and write models for independent scaling.",
      "Database indexing strategies: B-tree for range queries, hash indexes for equality, and covering indexes to avoid table scans.",
      "Message queues vs event streams: Kafka for durability, RabbitMQ for reliability, Redis Streams for simplicity.",
      "How to design APIs for pagination and cursor-based navigation without exposing internal database IDs.",
      "Rate limiting strategies: token buckets, sliding windows, and distributed rate limiting across multiple servers.",
      "Caching hierarchies: L1 (in-memory), L2 (local Redis), L3 (distributed cache), Database. Know when to invalidate each layer.",
      "Bloom filters for existence checks: probabilistic data structures that use minimal memory at the cost of false positives.",
      "Consistent hashing for distributed cache layers: ensuring that adding/removing nodes doesn't cause cache thrashing.",
      "Transaction isolation levels in PostgreSQL: READ UNCOMMITTED through SERIALIZABLE, and what each guarantees.",
      "Handling eventual consistency conflicts in distributed databases: vector clocks, CRDT data structures, and conflict-free replicated types."
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
      "SaaS design tip: your pricing page should be dead simple. Over-complex tiered packages confuse buyers and hurt conversion rates.",
      "We just hit 10k users! Celebrating this milestone by refactoring our monolith into services. Exciting times ahead.",
      "Hiring is harder than building. Found an amazing senior engineer who refused to work on our legacy codebase. Had to rewrite everything.",
      "Technical debt is like compound interest. Small shortcuts today become massive burdens tomorrow. Pay it down consistently.",
      "Bootstrapped our infrastructure on AWS: EC2, RDS, and ElastiCache. Costs are high but the flexibility is unmatched.",
      "Why we switched from MySQL to PostgreSQL: JSON support, window functions, and superior transaction handling made a huge difference.",
      "Monitoring and alerting: the difference between sleeping peacefully at night and waking up to PagerDuty alerts at 3am.",
      "We open-sourced our internal framework. Watching the community improve it is incredibly rewarding.",
      "Lessons learned from a catastrophic database migration: backup three times, test four times, migrate once.",
      "Building a culture of experimentation: A/B testing, feature flags, and data-driven decisions vs. hunches.",
      "Post-mortems aren't about blame; they're about learning. Our best improvements came from our worst outages.",
      "Burnout is real. Implementing on-call rotations and proper PTO policies made our team 10x more productive.",
      "APIs are contracts. Breaking changes are product decisions. Document backwards compatibility carefully.",
      "The hardest part of scaling isn't the infrastructure. It's coordinating across distributed teams and maintaining code quality."
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
      "Mastering PostgreSQL cursor-based pagination. Using base64 opaque cursors keeps queries index-friendly and scales infinitely.",
      "Type narrowing with discriminated unions: the best way to handle polymorphic types safely in TypeScript.",
      "Generic constraints in TypeScript: extends keyword helps you write reusable, type-safe abstractions without sacrificing flexibility.",
      "Async/await vs promises: both work, but async/await is more readable. Always await your promises explicitly.",
      "Express middleware ordering matters: authentication before authorization, logging before everything, error handlers last.",
      "Decorators in NestJS: @Controller, @Get, @Post, @UseGuards, @UseInterceptors form a beautiful declarative API.",
      "Testing strategies: unit tests for pure functions, integration tests for service orchestration, e2e tests for critical user flows.",
      "GraphQL vs REST: GraphQL eliminates over-fetching but adds complexity. Use REST for simple CRUD, GraphQL for graph-shaped data.",
      "Prototype pollution vulnerabilities in JavaScript: deeply merging user input without sanitization is a security nightmare.",
      "WeakMaps and WeakSets: for associating private metadata with objects without preventing garbage collection.",
      "Symbol primitive in JavaScript: creating truly private object properties that can't be enumerated.",
      "Rx.js Observables: Powerful for event streams, but be careful of subscription leaks and unsubscribe in ngOnDestroy.",
      "TypeScript strict mode: enable it immediately. The initial pain is worth the long-term safety guarantees.",
      "Arrow functions vs function declarations: arrow functions capture 'this', declarations don't. Choose wisely."
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
      "Taking a break from scaling databases to work on our landing page styling. Ambient dark modes are incredibly satisfying to build.",
      "Just shipped a feature that took 3 weeks of planning and 1 week of coding. The planning was worth every minute.",
      "Debugging production issues at 2am hits different. Found the bug, deployed the fix, back to bed in 45 minutes. Adrenaline is wild.",
      "Code review comments: 'Why does this function do 5 things?' Because sometimes simplicity requires a fresh perspective.",
      "Pair programming sessions unlock knowledge sharing that async reviews never achieve. Investing in synchronous time.",
      "git rebase vs git merge: once you understand rebase, there's no going back. Linear history is beautiful.",
      "Keyboard shortcuts for the terminal: the more you know, the faster you code. vim, tmux, zsh aliases = productivity.",
      "Docker containers made my local development match production perfectly. No more 'it works on my machine' excuses.",
      "Standing desk setup: monitor at eye level, keyboard and mouse at elbow height. Posture = performance.",
      "Just discovered a new language feature that solves a problem I've been struggling with for months. Mind blown.",
      "Code is read more often than it's written. Optimize for clarity, not cleverness.",
      "Writing a blog post about what you just learned forces you to understand it deeply. Blogging is teaching yourself.",
      "Open source contributions have taught me more about coding patterns than any tutorial ever could.",
      "Late night coding sessions hit different. Fewer interruptions, deeper focus, but watch out for sleep debt accumulating."
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
  "Could you share a schema snippet? I'm curious about the indexing setup.",
  "Great insights here. We faced similar challenges and ended up with a completely different solution.",
  "This is gold. Saving this for our architecture review next week.",
  "Have you considered using Kafka instead? Curious about your trade-off analysis.",
  "The pagination approach you described is exactly what we needed. Implementing this today.",
  "This reminds me of the scaling challenges Netflix faced with their recommendation system.",
  "Fantastic breakdown of the tradeoffs. Context switching costs are often underestimated.",
  "We implemented something similar but faced race conditions. How did you avoid that?",
  "This is a game-changer for our microservices architecture. Can't wait to experiment.",
  "The monitoring strategy here is next-level. Most teams skip this and pay dearly.",
  "Just experienced this exact problem yesterday. Your solution is perfect timing.",
  "Love the transparency about failures. This kind of post is way more valuable than success stories.",
  "Practical advice wrapped in solid theory. This is how technical content should be.",
  "Bookmarking this. Will definitely reference it in our design reviews.",
  "The depth here is incredible. Technical blogs like this are sadly rare these days.",
  "Question: did you measure the performance impact before and after this change?",
  "This approach scales horizontally in ways our previous solution never could.",
  "The operational complexity seems high. What's your runbook for incidents?",
  "Been using similar patterns for 5 years. Glad to see more people adopting this.",
  "This solves the exact problem we've been wrestling with for months.",
  "Phenomenal technical writing. Clear, concise, actionable steps.",
  "Our team is going through this exact migration right now. Perfect timing!",
  "The trade-offs here are well-articulated. This is systems thinking at its best.",
  "Just shared this with our entire engineering team. Discussion thread incoming.",
  "This is what I call 'earned perspective.' Experience really shows in this post.",
  "The code examples are incredibly helpful. Way better than purely theoretical posts.",
  "Saving this as a reference for junior developers on my team.",
  "This deserves way more engagement than it's getting. Sharing broadly.",
  "The failure story is what makes this post credible. Vulnerabilities build trust.",
  "Implementing this tomorrow. Our current approach is bottlenecking at exactly this point.",
  "The monitoring and observability section alone is worth the read.",
  "This is the kind of knowledge that takes years to accumulate. Grateful for the sharing.",
  "The visual diagrams really help understand the flow. More technical posts need this.",
  "Interesting perspective. Never thought about it this way before."
];

// Enhanced user roles and technologies
const ENGINEER_ROLES = [
  'Backend Developer', 'System Architect', 'Frontend Lead', 'DevOps Specialist', 
  'Fullstack Engineer', 'VP of Engineering', 'UX Engineer', 'Product Manager',
  'Staff Engineer', 'Database Administrator', 'Platform Engineer', 'Site Reliability Engineer',
  'Security Engineer', 'ML Engineer', 'Data Engineer', 'Cloud Architect',
  'Solutions Architect', 'Technical Lead', 'Engineering Manager', 'Principal Engineer'
];

const ENGINEER_TECHS = [
  'NestJS', 'TypeScript', 'Prisma', 'PostgreSQL', 'Redis', 'BullMQ', 
  'Docker', 'Kubernetes', 'Next.js', 'Go', 'Rust', 'Node.js',
  'Python', 'Java', 'Spring Boot', 'GraphQL', 'gRPC', 'Microservices',
  'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD', 'React', 'Vue.js',
  'MongoDB', 'DynamoDB', 'Elasticsearch', 'Message Queues', 'Apache Kafka'
];

const COMPANY_NAMES = [
  'TechCorp', 'DataFlow Systems', 'CloudScale Inc', 'Quantum Labs', 'Neural Networks AI',
  'Distributed Solutions', 'InnovateTech', 'CodeForce', 'Digital Innovations', 'Future Platforms',
  'ScaleUp Technologies', 'API First', 'DevOps Central', 'Cloud Native Co', 'Engineering Labs',
  'Startup Hub', 'Tech Collective', 'Code Academy', 'Dev Community', 'Systems Group'
];

const BIO_TEMPLATES = [
  "{role} at {company}. Passionate about {tech} and building scalable systems.",
  "I love {tech}. Currently {role} at {company}. Always learning, always shipping.",
  "Backend obsessed. {role} | {company}. Trying to make the internet faster.",
  "{role} specializing in {tech}. Building the future at {company}.",
  "Building things with {tech}. {role} at {company}. Coffee-driven development.",
  "Systems thinker. {role} at {company}. {tech} enthusiast.",
  "Platform engineer at {company}. Love {tech} and performance optimization.",
  "Writing {tech} code at {company}. {role} exploring distributed systems.",
  "{role} | {company}. {tech} fanatic. Open source contributor.",
  "Building scalable systems with {tech}. {role} at {company}. DM for tech discussions.",
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
  return shuffled.slice(0, Math.min(count, arr.length));
}

function generateBio(role: string, company: string, tech: string): string {
  const template = pickRandom(BIO_TEMPLATES);
  return template
    .replace('{role}', role)
    .replace('{company}', company)
    .replace('{tech}', tech);
}

function generateUsername(index: number): string {
  const prefixes = ['dev', 'eng', 'tech', 'code', 'sys', 'arch', 'full', 'stack', 'api', 'db'];
  const suffix = Math.floor(index / 100);
  return `${pickRandom(prefixes)}_${index}${suffix > 0 ? `_${suffix}` : ''}`;
}

function getProgressBar(current: number, total: number, width: number = 30): string {
  const percentage = Math.round((current / total) * 100);
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  return `[${bar}] ${percentage}%`;
}

async function main() {
  try {
    console.log('\n🚀 Initiating LARGE-SCALE database seeding script...');
    console.log(`📊 Target: ${TOTAL_USERS} users, ${MOCK_NORMAL_USERS} detailed profiles, extensive posts/comments/likes\n`);

    // ============ PHASE 1: Database Cleanup ============
    console.log('─'.repeat(60));
    console.log('PHASE 1: Database Cleanup');
    console.log('─'.repeat(60));
    
    console.log('🧹 Clearing existing database data safely...');
    const tables = ['FeedItem', 'Notification', 'Comment', 'Like', 'Follow', 'Post', 'User', 'Message', 'Bookmark'];
    for (const table of tables) {
      try {
        if (table === 'FeedItem') await prisma.feedItem.deleteMany({});
        else if (table === 'Notification') await prisma.notification.deleteMany({});
        else if (table === 'Comment') await prisma.comment.deleteMany({});
        else if (table === 'Like') await prisma.like.deleteMany({});
        else if (table === 'Follow') await prisma.follow.deleteMany({});
        else if (table === 'Post') await prisma.post.deleteMany({});
        else if (table === 'User') await prisma.user.deleteMany({});
        else if (table === 'Message') await prisma.message.deleteMany({});
        else if (table === 'Bookmark') await prisma.bookmark.deleteMany({});
      } catch (e) {
        // Table might not exist yet, skip
      }
    }
    console.log('✨ Database cleared successfully.');

    // Clear Redis
    console.log('🧹 Clearing Redis timeline cache keys...');
    const keys = await redis.keys('timeline:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️  Deleted ${keys.length} timeline cache keys from Redis.`);
    }

    // ============ PHASE 2: Password Hashing ============
    console.log('\n─'.repeat(60));
    console.log('PHASE 2: Pre-computing Password Hash');
    console.log('─'.repeat(60));
    
    console.log('🔐 Pre-computing password hash for all users...');
    const COMMON_HASH = await bcrypt.hash('Password123!', BCRYPT_ROUNDS);
    console.log('✅ Password hash ready.\n');

    // ============ PHASE 3: Create Core Users ============
    console.log('─'.repeat(60));
    console.log('PHASE 3: Creating Core Users (Demo, Celebrity, 50 Mock Detailed)');
    console.log('─'.repeat(60));
    
    console.log('👤 Creating demo and celebrity users...');
    const demoUser = await prisma.user.create({
      data: {
        email: 'demo@feed.dev',
        username: 'demo',
        passwordHash: COMMON_HASH,
        displayName: 'Demo User',
        bio: 'Lead Platform Architect at TechCorp. Exploring distributed systems, high-concurrency patterns, and scalable fanout engines. Open to collaborations!',
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
        bio: 'Principal Architect at CloudScale Inc. Author of "Distributed Systems at Scale". Speaker at major tech conferences. Passionate about Redis, PostgreSQL, and system design.',
        avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=celebrity',
        isCelebrity: true,
      }
    });
    console.log('✅ Demo and celebrity users created.');

    // Create 50 detailed mock users
    console.log(`👥 Creating ${MOCK_NORMAL_USERS} detailed mock user profiles...`);
    const mockUsersData: any[] = [];
    for (let i = 1; i <= MOCK_NORMAL_USERS; i++) {
      const username = generateUsername(i);
      const role = pickRandom(ENGINEER_ROLES);
      const tech = pickRandom(ENGINEER_TECHS);
      const company = pickRandom(COMPANY_NAMES);
      
      mockUsersData.push({
        email: `mock_user_${i}@feed.dev`,
        username,
        passwordHash: COMMON_HASH,
        displayName: `${role} ${i}`,
        bio: generateBio(role, company, tech),
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
        isCelebrity: false,
      });
    }

    await prisma.user.createMany({ data: mockUsersData });
    console.log(`✅ Created ${MOCK_NORMAL_USERS} detailed mock users.`);

    // Create remaining regular users
    console.log(`👥 Creating ${REGULAR_USERS} additional regular users...`);
    const BATCH_SIZE = 500;
    for (let batch = 0; batch < Math.ceil(REGULAR_USERS / BATCH_SIZE); batch++) {
      const batchStart = batch * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, REGULAR_USERS);
      const batchSize = batchEnd - batchStart;
      
      const regularUsersData: any[] = [];
      for (let i = batchStart + 51; i <= batchStart + 50 + batchSize; i++) {
        const username = generateUsername(i);
        const role = pickRandom(ENGINEER_ROLES);
        const tech = pickRandom(ENGINEER_TECHS);
        const company = pickRandom(COMPANY_NAMES);

        regularUsersData.push({
          email: `user_${i}@feed.dev`,
          username,
          passwordHash: COMMON_HASH,
          displayName: `Developer ${i}`,
          bio: generateBio(role, company, tech),
          avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
          isCelebrity: false,
        });
      }

      await prisma.user.createMany({ data: regularUsersData });
      const progress = Math.min(batchEnd, REGULAR_USERS);
      console.log(`  ${getProgressBar(progress, REGULAR_USERS)} (${progress}/${REGULAR_USERS})`);
    }
    console.log(`✅ All ${REGULAR_USERS} regular users created.\n`);

    // Fetch all users
    const allUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' }
    });
    console.log(`✅ Total users in database: ${allUsers.length}`);

    // ============ PHASE 4: Follow Relationships ============
    console.log('\n─'.repeat(60));
    console.log('PHASE 4: Building Follow Network');
    console.log('─'.repeat(60));
    
    console.log('🔗 Generating follow relationships...');
    const followsToCreate: any[] = [];
    const userIds = allUsers.map(u => u.id);
    const nonCelebrityIds = allUsers.filter(u => u.id !== celebrityUser.id).map(u => u.id);

    // 1. Everyone follows celebrity
    for (const userId of nonCelebrityIds) {
      followsToCreate.push({
        followerId: userId,
        followingId: celebrityUser.id,
      });
    }

    // 2. Demo follows random subset
    const demoFollowing = pickRandomSubset(nonCelebrityIds.filter(id => id !== demoUser.id), Math.floor(TOTAL_USERS * 0.15));
    for (const followeeId of demoFollowing) {
      followsToCreate.push({
        followerId: demoUser.id,
        followingId: followeeId,
      });
    }

    // 3. Random follows celebrity
    followsToCreate.push({
      followerId: demoUser.id,
      followingId: celebrityUser.id,
    });

    // 4. Random users follow demo
    const demoFollowers = pickRandomSubset(nonCelebrityIds.filter(id => id !== demoUser.id), Math.floor(TOTAL_USERS * 0.08));
    for (const followerId of demoFollowers) {
      followsToCreate.push({
        followerId,
        followingId: demoUser.id,
      });
    }

    // 5. Create dense graph: each user follows 8-15 others (Poisson distribution)
    console.log('  Building dense follow graph...');
    for (let i = 0; i < nonCelebrityIds.length; i++) {
      const userId = nonCelebrityIds[i];
      const followCount = Math.floor(Math.random() * 8) + 8; // 8-15 followers
      const followees = pickRandomSubset(
        nonCelebrityIds.filter(id => id !== userId && id !== celebrityUser.id),
        followCount
      );
      
      for (const followeeId of followees) {
        followsToCreate.push({
          followerId: userId,
          followingId: followeeId,
        });
      }

      if (i % 250 === 0) {
        console.log(`  ${getProgressBar(i, nonCelebrityIds.length)} (${i}/${nonCelebrityIds.length})`);
      }
    }

    // Deduplicate and create
    const uniqueFollows = new Map<string, any>();
    for (const follow of followsToCreate) {
      const key = `${follow.followerId}_${follow.followingId}`;
      uniqueFollows.set(key, follow);
    }

    const FOLLOW_BATCH = 1000;
    const uniqueFollowsArray = Array.from(uniqueFollows.values());
    for (let i = 0; i < uniqueFollowsArray.length; i += FOLLOW_BATCH) {
      const chunk = uniqueFollowsArray.slice(i, i + FOLLOW_BATCH);
      await prisma.follow.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      
      if (i % 5000 === 0) {
        console.log(`  ${getProgressBar(Math.min(i + FOLLOW_BATCH, uniqueFollowsArray.length), uniqueFollowsArray.length)}`);
      }
    }

    console.log(`✅ Created ${uniqueFollowsArray.length} follow relationships.\n`);

    // ============ PHASE 5: Update User Counts ============
    console.log('─'.repeat(60));
    console.log('PHASE 5: Synchronizing User Metrics');
    console.log('─'.repeat(60));
    
    console.log('📊 Updating follower/following counts...');
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const followers = await prisma.follow.count({ where: { followingId: user.id } });
      const following = await prisma.follow.count({ where: { followerId: user.id } });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          followerCount: followers,
          followingCount: following,
          isCelebrity: followers >= CELEBRITY_THRESHOLD || user.id === celebrityUser.id,
        }
      });

      if (i % 100 === 0) {
        console.log(`  ${getProgressBar(i, allUsers.length)}`);
      }
    }
    console.log('✅ User metrics synchronized.\n');

    // ============ PHASE 6: Create Posts ============
    console.log('─'.repeat(60));
    console.log('PHASE 6: Seeding Posts');
    console.log('─'.repeat(60));
    
    console.log('📝 Creating posts across all users...');
    const postsToCreate: any[] = [];

    // Celebrity posts: 15-25 posts
    console.log('  Creating celebrity posts...');
    for (let i = 0; i < 20; i++) {
      postsToCreate.push({
        authorId: celebrityUser.id,
        content: pickRandom(POST_TOPICS[i % POST_TOPICS.length].templates),
        createdAt: getRandomDate(30),
        updatedAt: new Date(),
      });
    }

    // Demo user posts: 10-15 posts
    for (let i = 0; i < 12; i++) {
      postsToCreate.push({
        authorId: demoUser.id,
        content: `[Personal reflection] ${pickRandom(POST_TOPICS[i % POST_TOPICS.length].templates)}`,
        createdAt: getRandomDate(30),
        updatedAt: new Date(),
      });
    }

    // Regular users: 3-10 posts each
    console.log('  Creating posts for all other users...');
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      if (user.id === celebrityUser.id || user.id === demoUser.id) continue;

      const postCount = Math.floor(Math.random() * 8) + 3; // 3-10 posts
      for (let p = 0; p < postCount; p++) {
        postsToCreate.push({
          authorId: user.id,
          content: pickRandom(pickRandom(POST_TOPICS).templates),
          createdAt: getRandomDate(30),
          updatedAt: new Date(),
        });
      }

      if (i % 200 === 0) {
        console.log(`  ${getProgressBar(i, allUsers.length)}`);
      }
    }

    // Batch insert posts
    const POST_BATCH = 500;
    for (let i = 0; i < postsToCreate.length; i += POST_BATCH) {
      const chunk = postsToCreate.slice(i, i + POST_BATCH);
      await prisma.post.createMany({ data: chunk });
      console.log(`  ${getProgressBar(Math.min(i + POST_BATCH, postsToCreate.length), postsToCreate.length)}`);
    }

    const allPosts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Created ${allPosts.length} posts.\n`);

    // ============ PHASE 7: Likes ============
    console.log('─'.repeat(60));
    console.log('PHASE 7: Seeding Likes');
    console.log('─'.repeat(60));
    
    console.log('❤️  Creating likes...');
    const likesToCreate: any[] = [];
    const uniqueLikes = new Set<string>();

    // Celebrity posts get many likes
    const celebrityPosts = allPosts.filter(p => p.authorId === celebrityUser.id);
    for (const post of celebrityPosts) {
      const likerCount = Math.floor(Math.random() * 60) + 30; // 30-90 likes
      const likers = pickRandomSubset(
        allUsers.filter(u => u.id !== post.authorId),
        Math.min(likerCount, allUsers.length - 1)
      );

      for (const liker of likers) {
        const key = `${liker.id}_${post.id}`;
        if (!uniqueLikes.has(key)) {
          uniqueLikes.add(key);
          likesToCreate.push({
            userId: liker.id,
            postId: post.id,
          });
        }
      }
    }

    // Regular posts get fewer likes
    const regularPosts = allPosts.filter(p => p.authorId !== celebrityUser.id);
    for (let i = 0; i < regularPosts.length; i++) {
      const post = regularPosts[i];
      const likerCount = Math.floor(Math.random() * 8) + 1; // 1-8 likes
      const likers = pickRandomSubset(
        allUsers.filter(u => u.id !== post.authorId),
        Math.min(likerCount, allUsers.length - 1)
      );

      for (const liker of likers) {
        const key = `${liker.id}_${post.id}`;
        if (!uniqueLikes.has(key)) {
          uniqueLikes.add(key);
          likesToCreate.push({
            userId: liker.id,
            postId: post.id,
          });
        }
      }

      if (i % 500 === 0) {
        console.log(`  ${getProgressBar(i, regularPosts.length)}`);
      }
    }

    // Batch insert likes
    const LIKE_BATCH = 1000;
    for (let i = 0; i < likesToCreate.length; i += LIKE_BATCH) {
      const chunk = likesToCreate.slice(i, i + LIKE_BATCH);
      await prisma.like.createMany({ data: chunk, skipDuplicates: true });
      console.log(`  ${getProgressBar(Math.min(i + LIKE_BATCH, likesToCreate.length), likesToCreate.length)}`);
    }
    console.log(`✅ Created ${likesToCreate.length} likes.\n`);

    // ============ PHASE 8: Comments ============
    console.log('─'.repeat(60));
    console.log('PHASE 8: Seeding Comments');
    console.log('─'.repeat(60));
    
    console.log('💬 Creating comments...');
    const commentsToCreate: any[] = [];

    // Celebrity posts get many comments
    for (let i = 0; i < celebrityPosts.length; i++) {
      const post = celebrityPosts[i];
      const commentCount = Math.floor(Math.random() * 8) + 4; // 4-12 comments
      const commenters = pickRandomSubset(
        allUsers.filter(u => u.id !== post.authorId),
        Math.min(commentCount, allUsers.length - 1)
      );

      for (const commenter of commenters) {
        commentsToCreate.push({
          postId: post.id,
          userId: commenter.id,
          content: pickRandom(COMMENT_TEMPLATES),
          createdAt: getRandomDate(7),
        });
      }
    }

    // Regular posts get some comments
    for (let i = 0; i < regularPosts.length; i++) {
      const post = regularPosts[i];
      const hasComment = Math.random() < 0.20; // 20% of posts get comments
      
      if (hasComment) {
        const commentCount = Math.floor(Math.random() * 2) + 1; // 1-2 comments
        const commenters = pickRandomSubset(
          allUsers.filter(u => u.id !== post.authorId),
          Math.min(commentCount, allUsers.length - 1)
        );

        for (const commenter of commenters) {
          commentsToCreate.push({
            postId: post.id,
            userId: commenter.id,
            content: pickRandom(COMMENT_TEMPLATES),
            createdAt: getRandomDate(7),
          });
        }
      }

      if (i % 500 === 0) {
        console.log(`  ${getProgressBar(i, regularPosts.length)}`);
      }
    }

    // Batch insert comments
    const COMMENT_BATCH = 500;
    for (let i = 0; i < commentsToCreate.length; i += COMMENT_BATCH) {
      const chunk = commentsToCreate.slice(i, i + COMMENT_BATCH);
      await prisma.comment.createMany({ data: chunk });
      console.log(`  ${getProgressBar(Math.min(i + COMMENT_BATCH, commentsToCreate.length), commentsToCreate.length)}`);
    }
    console.log(`✅ Created ${commentsToCreate.length} comments.\n`);

    // ============ PHASE 9: Update Post Metrics ============
    console.log('─'.repeat(60));
    console.log('PHASE 9: Updating Post Metrics');
    console.log('─'.repeat(60));
    
    console.log('📊 Synchronizing post metrics (batch update)...');
    
    // Fetch all likes and comments in bulk
    const allLikes = await prisma.like.findMany({});
    const allComments = await prisma.comment.findMany({});
    
    // Create maps for fast lookup
    const likeCountMap = new Map<string, number>();
    const commentCountMap = new Map<string, number>();
    
    for (const like of allLikes) {
      const key = like.postId;
      likeCountMap.set(key, (likeCountMap.get(key) || 0) + 1);
    }
    
    for (const comment of allComments) {
      const key = comment.postId;
      commentCountMap.set(key, (commentCountMap.get(key) || 0) + 1);
    }
    
    // Batch update posts
    for (let i = 0; i < allPosts.length; i++) {
      const post = allPosts[i];
      const likes = likeCountMap.get(post.id) || 0;
      const comments = commentCountMap.get(post.id) || 0;

      await prisma.post.update({
        where: { id: post.id },
        data: {
          likesCount: likes,
          commentsCount: comments,
        }
      });

      if (i % 500 === 0) {
        console.log(`  ${getProgressBar(i, allPosts.length)}`);
      }
    }
    console.log('✅ Post metrics synchronized.\n');

    // ============ PHASE 10: Notifications ============
    console.log('─'.repeat(60));
    console.log('PHASE 10: Seeding Notifications');
    console.log('─'.repeat(60));
    
    console.log('🔔 Creating notifications...');
    const notificationsToCreate: any[] = [];

    // Get follows and likes for notifications
    const demoFollows = await prisma.follow.findMany({ where: { followingId: demoUser.id }, take: 20 });
    const demoPosts = await prisma.post.findMany({ where: { authorId: demoUser.id } });
    const demoLikes = await prisma.like.findMany({
      where: { post: { authorId: demoUser.id } },
      take: 50
    });

    // Follow notifications
    for (const follow of demoFollows.slice(0, 10)) {
      notificationsToCreate.push({
        userId: demoUser.id,
        actorId: follow.followerId,
        type: 'FOLLOW',
        isRead: false,
        createdAt: getRandomDate(7),
      });
    }

    // Like notifications
    for (const like of demoLikes.slice(0, 30)) {
      notificationsToCreate.push({
        userId: demoUser.id,
        actorId: like.userId,
        type: 'LIKE',
        postId: like.postId,
        isRead: false,
        createdAt: getRandomDate(3),
      });
    }

    // Comment notifications
    const demoComments = await prisma.comment.findMany({
      where: { post: { authorId: demoUser.id } },
      take: 30
    });
    for (const comment of demoComments) {
      notificationsToCreate.push({
        userId: demoUser.id,
        actorId: comment.userId,
        type: 'COMMENT',
        postId: comment.postId,
        isRead: false,
        createdAt: getRandomDate(3),
      });
    }

    if (notificationsToCreate.length > 0) {
      await prisma.notification.createMany({ data: notificationsToCreate });
    }
    console.log(`✅ Created ${notificationsToCreate.length} notifications.\n`);

    // ============ PHASE 11: FeedItems ============
    console.log('─'.repeat(60));
    console.log('PHASE 11: Materializing FeedItem Cache');
    console.log('─'.repeat(60));
    
    console.log('🧩 Building FeedItem denormalized table...');
    const follows = await prisma.follow.findMany({});
    const followMap = new Map<string, string[]>();
    for (const follow of follows) {
      if (!followMap.has(follow.followerId)) {
        followMap.set(follow.followerId, []);
      }
      followMap.get(follow.followerId)!.push(follow.followingId);
    }

    const feedItemsToCreate: any[] = [];
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const followedIds = followMap.get(user.id) || [];
      
      if (followedIds.length === 0) continue;

      const followedPosts = allPosts.filter(p => followedIds.includes(p.authorId));
      const latestPosts = followedPosts.slice(0, 500); // Last 500 posts from follows

      for (const post of latestPosts) {
        feedItemsToCreate.push({
          userId: user.id,
          postId: post.id,
          authorId: post.authorId,
          createdAt: post.createdAt,
        });
      }

      if (i % 100 === 0) {
        console.log(`  ${getProgressBar(i, allUsers.length)}`);
      }
    }

    const FEED_BATCH = 1000;
    for (let i = 0; i < feedItemsToCreate.length; i += FEED_BATCH) {
      const chunk = feedItemsToCreate.slice(i, i + FEED_BATCH);
      await prisma.feedItem.createMany({ data: chunk, skipDuplicates: true });
      console.log(`  ${getProgressBar(Math.min(i + FEED_BATCH, feedItemsToCreate.length), feedItemsToCreate.length)}`);
    }
    console.log(`✅ Created ${feedItemsToCreate.length} FeedItem entries.\n`);

    // ============ PHASE 12: Redis Caching ============
    console.log('─'.repeat(60));
    console.log('PHASE 12: Rebuilding Redis Timeline Caches');
    console.log('─'.repeat(60));
    
    console.log('⚡ Populating Redis Sorted Sets for timelines...');
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const followedIds = followMap.get(user.id) || [];
      
      if (followedIds.length === 0) continue;

      const userPosts = allPosts.filter(p => followedIds.includes(p.authorId));
      const trimmedPosts = userPosts.slice(0, TIMELINE_CACHE_SIZE);

      if (trimmedPosts.length > 0) {
        const timelineKey = `timeline:${user.id}`;
        const pipeline = redis.pipeline();

        for (const post of trimmedPosts) {
          pipeline.zadd(timelineKey, post.createdAt.getTime(), post.id);
        }

        await pipeline.exec();
      }

      if (i % 100 === 0) {
        console.log(`  ${getProgressBar(i, allUsers.length)}`);
      }
    }
    console.log('✅ Redis caches populated.\n');

    // ============ Cleanup & Summary ============
    console.log('─'.repeat(60));
    console.log('CLEANUP & SUMMARY');
    console.log('─'.repeat(60));
    
    console.log('🔌 Shutting down database and cache connections...');
    await prisma.$disconnect();
    await pool.end();
    await redis.quit();
    console.log('✅ Connections closed.\n');

    // Print summary
    console.log('🌟'.repeat(30));
    console.log('\n✨ SEEDING COMPLETE! ✨\n');
    console.log('═'.repeat(60));
    console.log('📊 SEEDING SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Total Users Created: ${allUsers.length}`);
    console.log(`   • Demo User: 1`);
    console.log(`   • Celebrity User: 1`);
    console.log(`   • Detailed Mock Users: ${MOCK_NORMAL_USERS}`);
    console.log(`   • Regular Users: ${REGULAR_USERS}`);
    console.log(`✅ Total Follows: ${uniqueFollowsArray.length}`);
    console.log(`✅ Total Posts: ${allPosts.length}`);
    console.log(`✅ Total Likes: ${likesToCreate.length}`);
    console.log(`✅ Total Comments: ${commentsToCreate.length}`);
    console.log(`✅ Total Notifications: ${notificationsToCreate.length}`);
    console.log(`✅ Total FeedItems: ${feedItemsToCreate.length}`);
    console.log('═'.repeat(60));
    console.log('\n🔐 TEST ACCOUNT CREDENTIALS:');
    console.log('─'.repeat(60));
    console.log('Demo User:');
    console.log('  📧 Email: demo@feed.dev');
    console.log('  🔑 Password: Password123!');
    console.log('\nCelebrity User:');
    console.log('  📧 Email: celebrity@feed.dev');
    console.log('  🔑 Password: Password123!');
    console.log('\nRegular Users:');
    console.log('  📧 user_1@feed.dev ... user_1000@feed.dev');
    console.log('  🔑 Password: Password123! (same for all)');
    console.log('─'.repeat(60));
    console.log('\n🚀 Ready to start! Run: npm run start:dev');
    console.log('🌟'.repeat(30) + '\n');

  } catch (error) {
    console.error('\n💥 SEEDING FAILED:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('💥 Database seeding failed:', err);
  process.exit(1);
});
