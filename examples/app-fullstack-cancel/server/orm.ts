import type { MikroORM } from '@mikro-orm/core';
import { UserSchema, type User } from './entities/user';

// MikroORM 7.1 accepts this on em.fork()/find()/count() etc. Declared locally so the module does
// not depend on the type being re-exported by a given driver package.
export type InflightQueryAbortStrategy = 'ignore query' | 'cancel query' | 'kill session';

export interface OrmBundle {
  orm: MikroORM;
  driver: 'pglite' | 'postgresql';
  /**
   * The abort strategy the driver supports. PGlite runs Postgres in-process (WASM) and cannot
   * wire-cancel a running statement, so it only supports 'ignore query'. A real Postgres server
   * (PG_DB_URL) supports 'cancel query', which issues pg_cancel_backend.
   */
  inflightQueryAbortStrategy: InflightQueryAbortStrategy;
  close(): Promise<void>;
}

export interface CreateOrmOptions {
  /** Called with every executed SQL statement, for tests that count queries. */
  onQuery?: (sql: string) => void;
}

/** How many result rows the search returns and enriches. Enrichment is one query per row. */
export const RESULT_LIMIT = 15;

/** Seeded rows. Large enough that the per-row enrichment scan takes real time to run. */
export const SEED_USER_COUNT = 50_000;

const FIRST = ['Ada', 'Alan', 'Grace', 'Linus', 'Dennis', 'Margaret', 'Ken', 'Barbara', 'Guido', 'Anita'];
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Ritchie', 'Hamilton', 'Thompson', 'Liskov', 'Rossum', 'Borg'];
const CITIES = ['London', 'Lisbon', 'Seattle', 'Tokyo', 'Berlin', 'Austin'];

/** The search predicate the article uses: name or email contains the query. */
export function searchWhere(q: string) {
  const like = `%${q}%`;
  return { $or: [{ name: { $like: like } }, { email: { $like: like } }] };
}

/**
 * Boots MikroORM and seeds a deterministic user table. Driver is chosen from the environment:
 * in-memory PGlite by default, real Postgres when PG_DB_URL is set. No code elsewhere changes
 * between the two.
 */
export async function createOrm(options: CreateOrmOptions = {}): Promise<OrmBundle> {
  const url = process.env.PG_DB_URL;
  const pkg = url ? '@mikro-orm/postgresql' : '@mikro-orm/pglite';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MikroORM, defineConfig } = require(pkg);

  const orm: MikroORM = await MikroORM.init(
    defineConfig({
      entities: [UserSchema],
      ...(url ? { clientUrl: url } : {}),
      debug: options.onQuery ? ['query'] : false,
      logger: options.onQuery
        ? (message: string) => {
            if (message.includes('select') || message.includes('SELECT')) options.onQuery!(message);
          }
        : undefined,
    }),
  );

  await orm.schema.refresh();
  await seed(orm);

  return {
    orm,
    driver: url ? 'postgresql' : 'pglite',
    inflightQueryAbortStrategy: url ? 'cancel query' : 'ignore query',
    close: () => orm.close(true),
  };
}

async function seed(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();
  const rows: User[] = [];
  for (let id = 1; id <= SEED_USER_COUNT; id++) {
    rows.push({
      id,
      name: `${FIRST[id % FIRST.length]} ${LAST[(id * 7) % LAST.length]}`,
      email: `user${id}@example.com`,
      city: CITIES[id % CITIES.length],
    });
  }
  // Bulk insert bypasses the unit of work, so seeding 50k rows stays fast.
  const CHUNK = 2_000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await em.insertMany(UserSchema, rows.slice(i, i + CHUNK));
  }
}
