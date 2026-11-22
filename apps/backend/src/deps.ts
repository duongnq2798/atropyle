import type { ChainPort } from './chain/port';
import type { Clock } from './clock';
import type { Config } from './config';
import type { Sql } from './db/sql';
import type { Log } from './log';
import type { Mailer } from './mail/mailer';

/** The five ports and the settings every handler and tick phase receives. */
export interface Deps {
  sql: Sql;
  chain: ChainPort;
  mailer: Mailer;
  clock: Clock;
  log: Log;
  config: Config;
  /** Cryptographic randomness (crypto.getRandomValues in production). */
  random(size: number): Uint8Array;
  /** Set when the keeper secret is present but unusable: the keeper then runs dry and ops get one alert. */
  keeperError: string | null;
}
