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

    let uCeleb = await register('celeb' + Date.now(), 'celeb' + Date.now() + '@example.com');
    let uNormal = await register('norm' + Date.now(), 'norm' + Date.now() + '@example.com');
    let uFan = await register('fan' + Date.now(), 'fan' + Date.now() + '@example.com');

    const tokenCeleb = uCeleb.data.accessToken;
    const tokenNormal = uNormal.data.accessToken;
    const tokenFan = uFan.data.accessToken;

    const idCeleb = uCeleb.data.user.id;
    const idNormal = uNormal.data.user.id;

    // Promote celeb manually via raw pg query
    await client.query('UPDATE "User" SET "isCelebrity" = true WHERE id = $1', [idCeleb]);

    // Fan follows both
    await fetch('http://localhost:3000/api/v1/users/' + idCeleb + '/follow', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + tokenFan }
    });
    await fetch('http://localhost:3000/api/v1/users/' + idNormal + '/follow', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + tokenFan }
    });

    // Celeb posts
    const postResCeleb = await fetch('http://localhost:3000/api/v1/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tokenCeleb },
      body: JSON.stringify({ content: 'Hello from a Celebrity!' })
    });
    const postCeleb = await postResCeleb.json();

    // Normal posts (This will initialize the Redis timeline for Fan)
    const postResNormal = await fetch('http://localhost:3000/api/v1/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tokenNormal },
      body: JSON.stringify({ content: 'Hello from a Normal user!' })
    });
    const postNormal = await postResNormal.json();
    
    // Wait for BullMQ worker to process the normal post fanout
    await new Promise(r => setTimeout(r, 1000));

    const feedRes = await fetch('http://localhost:3000/api/v1/feed', {
      headers: { 'Authorization': 'Bearer ' + tokenFan }
    });
    const feed = await feedRes.json();
    
    console.log('Feed strategy used:', feed.data.meta.strategy);
    console.log('Has celebrity post?', feed.data.items.some(i => i.id === postCeleb.data.id));
    console.log('Has normal post?', feed.data.items.some(i => i.id === postNormal.data.id));
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
};
test();
