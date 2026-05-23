const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const usersCount = await prisma.user.count();
  console.log(`Total users: ${usersCount}`);

  const usersWithPosts = await prisma.post.groupBy({
    by: ['authorId'],
    _count: {
      id: true,
    },
  });

  console.log(`Users with posts:`);
  for (const u of usersWithPosts) {
    const user = await prisma.user.findUnique({ where: { id: u.authorId }});
    console.log(`- ${user.username} (${u.authorId}): ${u._count.id} posts`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
