import pg from "pg";

const { Pool } = pg;

// Preferred: a single connection string (Supabase/Neon/most free Postgres hosts).
const connectionString = process.env.DATABASE_URL;
// On Cloud Run, DB_HOST is a unix socket path like /cloudsql/PROJECT:REGION:INSTANCE
const isSocket = (process.env.DB_HOST || "").startsWith("/");

export const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } }) // hosted Postgres requires SSL
  : new Pool(
      isSocket
        ? {
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
          }
        : {
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
          }
    );

export const query = (text, params) => pool.query(text, params);

// run a function inside a transaction
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
