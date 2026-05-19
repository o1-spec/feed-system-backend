const { Client } = require('pg');

const test = async () => {
  const client = new Client({ connectionString: 'postgresql://feed_user:feed_password@localhost:5470/feed_system?schema=public' });
  await client.connect();
  
  try {
    const register = async (u, e) => {
      const res = await fetch('http://localhost:3000/api/v1/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: e, password: 'password123' })
      });
      return await res.json();
    };

    let u1 = await register('celeb' + Date.now(), 'celeb' + Date.now() + '@example.com');
    let u2 = await register('fan' + Date.now(), 'fan' + Date.now() + '@example.com');

    const token1 = u1.data.accessToken;
    const token2 = u2.data.accessToken;
    const id1 = u1.data.user.id;

    // Promote u1 to celebrity manually via raw pg query
    await client.query('UPDATE "User" SET "isCelebrity" = true WHERE id = $1', [id1]);

    await fetch('http://localhost:3000/api/v1/users/' + id1 + '/follow', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token2 }
    });

    const postRes = await fetch('http://localhost:3000/api/v1/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token1 },
      body: JSON.stringify({ content: 'Hello from a Celebrity!' })
    });
    const post = await postRes.json();
    console.log('Celebrity Post created:', post.data.id);

    const feedRes = await fetch('http://localhost:3000/api/v1/feed', {
      headers: { 'Authorization': 'Bearer ' + token2 }
    });
    const feed = await feedRes.json();
    console.log('Feed strategy used:', feed.data.meta.strategy);
    console.log('Has celebrity post?', feed.data.items.some(i => i.id === post.data.id));
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
};
test();
