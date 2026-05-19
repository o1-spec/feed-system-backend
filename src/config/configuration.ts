export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6383', 10),
  },

  feed: {
    // Dev: 100, Production: 10_000
    celebrityThreshold: parseInt(process.env.CELEBRITY_THRESHOLD || '100', 10),
    // Max post IDs cached per user timeline in Redis
    timelineCacheSize: parseInt(process.env.TIMELINE_CACHE_SIZE || '1000', 10),
  },
});
