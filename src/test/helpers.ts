import { PhilipDB, initDatabase } from '../db/db';

let n = 0;
/** Fresh isolated database per test (fake-indexeddb). */
export async function freshDb(): Promise<PhilipDB> {
  const db = new PhilipDB(`test-${Date.now()}-${n++}`);
  await initDatabase(db);
  return db;
}
