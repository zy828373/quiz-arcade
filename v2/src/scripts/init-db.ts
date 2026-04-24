import { createAppConfig } from '../config/app-config.ts';
import { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'db-init',
});

const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

database.initialize();

logger.info('database.bootstrap_complete', {
  databasePath: config.databasePath,
  schemaVersion: database.getMetadataValue('schema_version'),
});

database.close();
