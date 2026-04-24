import { createAppConfig } from '../config/app-config.ts';
import { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';
import { ShadowScheduler, type FeedbackOutcome } from '../routing/shadow-scheduler.ts';

function readFlag(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }

  return process.argv[index + 1];
}

function readOutcome(): FeedbackOutcome {
  const rawOutcome = readFlag('--outcome');
  if (rawOutcome === 'success' || rawOutcome === 'failure' || rawOutcome === 'rate_limit' || rawOutcome === 'auth_error') {
    return rawOutcome;
  }

  throw new Error('scheduler feedback requires --outcome success|failure|rate_limit|auth_error');
}

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'scheduler-feedback',
});
const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

try {
  database.initialize();

  const scheduler = new ShadowScheduler(config, database, logger.child({ component: 'scheduler' }));
  const result = scheduler.recordFeedback({
    accountUid: readFlag('--account'),
    decisionId: readFlag('--decision'),
    detail: readFlag('--detail'),
    observedAt: readFlag('--timestamp'),
    outcome: readOutcome(),
  });

  console.log(JSON.stringify(result));
} finally {
  database.close();
}
