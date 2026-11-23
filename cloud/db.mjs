import pg from 'pg';
let shared;
export function cloudPool(env=process.env){
 if(!env.DATABASE_URL)throw Error('ต้องตั้ง DATABASE_URL ฝั่ง server');
 const url=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL ไม่ใช่ PostgreSQL');
 if(!shared)shared=new pg.Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,statement_timeout:12000,application_name:'pettinee-cloud'});
 return shared;
}
export async function transaction(pool,fn){const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
