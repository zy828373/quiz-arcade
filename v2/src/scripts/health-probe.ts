import { createAppConfig } from '../config/app-config.ts';
import { runHealthProbe } from '../health/probe-engine.ts';
import { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'health-probe',
});

const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

try {
  database.initialize();

  const summary = await runHealthProbe(
    database,
    logger.child({ component: 'health' }),
    undefined,
    {
      workspaceRoot: config.workspaceRoot,
    },
  );

  console.log(JSON.stringify(summary));
} finally {
  database.close();
}
