import { createAppConfig } from '../config/app-config.ts';
import { syncAccountRegistry } from '../control/account-sync.ts';
import { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'accounts-sync',
});

const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

try {
  database.initialize();

  const summary = syncAccountRegistry(config, database, logger.child({ component: 'registry' }));

  console.log(JSON.stringify(summary));
} finally {
  database.close();
}
