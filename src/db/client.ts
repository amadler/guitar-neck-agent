import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString = process.env.DATABASE_URL ?? "postgres://guitarneck:guitarneck@localhost:5432/guitarneck";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

function createClientWithRetry(): postgres.Sql {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const client = postgres(connectionString, {
        connect_timeout: 10,
        max: 10,
        idle_timeout: 30,
      });
      return client;
    } catch (err) {
      attempt++;
      console.error(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, (err as Error).message);
      if (attempt >= MAX_RETRIES) {
        console.error("[DB] All connection attempts exhausted. Starting without DB — endpoints will return 503.");
        // Return a client that will fail gracefully on queries
        return postgres(connectionString, {
          connect_timeout: 10,
          max: 10,
        });
      }
      // Wait before retrying
      const start = Date.now();
      while (Date.now() - start < RETRY_DELAY_MS) {
        // synchronous wait
      }
    }
  }
  // Should never reach here, but TypeScript needs a return
  return postgres(connectionString, { connect_timeout: 10, max: 10 });
}

const client = createClientWithRetry();

export const db = drizzle(client, { schema });

export type Db = typeof db;