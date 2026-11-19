declare module "node:sqlite" {
  interface StatementSync {
    run(...params: Array<string | number | bigint | null>): unknown;
    all(...params: Array<string | number | bigint | null>): unknown[];
    get(...params: Array<string | number | bigint | null>): unknown;
  }

  export class DatabaseSync {
    constructor(location: string, options?: { timeout?: number });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
