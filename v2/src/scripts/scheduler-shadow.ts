import { createAppConfig } from '../config/app-config.ts';
import { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';
import { ShadowScheduler } from '../routing/shadow-scheduler.ts';

function readFlag(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }

  return process.argv[index + 1];
}

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'scheduler-shadow',
});
const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

try {
  database.initialize();

  const scheduler = new ShadowScheduler(config, database, logger.child({ component: 'scheduler' }));
  const decision = scheduler.persistDecision({
    model: readFlag('--model'),
    protocol: readFlag('--protocol'),
    timestamp: readFlag('--timestamp'),
  });

  console.log(JSON.stringify(decision));
} finally {
  database.close();
}
