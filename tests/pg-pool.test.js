// Regression: concurrent cold-start calls must reserve pool capacity before connecting.
const fs=require('fs'),assert=require('node:assert/strict');
const {PgConnectionPool,parsePostgresUrl}=require('../src/server/pgClient');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
(async()=>{const pool=new PgConnectionPool(parsePostgresUrl(env.SUPABASE_DB_URL.replace(':5432/',':6543/')),2);try{await Promise.all(Array.from({length:12},()=>pool.query('SELECT pg_sleep(0.01), 1 AS n')));assert.equal(pool.clients.length,2);assert.equal(pool.pendingConnections.length,0);console.log('PG_POOL_CONCURRENCY_TEST_PASSED');}finally{pool.clients.forEach(c=>c.close());}})().catch(e=>{console.error(e);process.exitCode=1});
