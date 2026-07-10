export type DbClient = any;
export function createDb(_: string) {
  return { db: {} as DbClient, close: async () => {} };
}
