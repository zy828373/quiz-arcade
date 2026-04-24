import { createAppConfig } from '../config/app-config.ts';
import { resolveServiceBaseUrls } from '../control/cutover.ts';
import { ControlPlaneService } from '../control/control-service.ts';
import { HealthService } from '../health/health-service.ts';
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

function requireMode(): 'legacy' | 'parallel' | 'canary' | 'primary' {
  const mode = readFlag('--mode');
  if (mode === 'legacy' || mode === 'parallel' || mode === 'canary' || mode === 'primary') {
    return mode;
  }

  throw new Error('Missing or invalid --mode. Expected legacy|parallel|canary|primary.');
}

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
  module: 'cutover-mode',
});
const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));

try {
  database.initialize();

  const scheduler = new ShadowScheduler(config, database, logger.child({ component: 'scheduler' }));
  const healthService = new HealthService(config, database, scheduler);
  const controlPlaneService = new ControlPlaneService(
    {
      authSources: config.authSources,
      workspaceRoot: config.workspaceRoot,
    },
    database,
    healthService,
    scheduler,
    logger.child({ component: 'control' }),
  );

  controlPlaneService.setServiceBaseUrls(resolveServiceBaseUrls({
    explicitPublicBaseUrl: process.env.V2_PUBLIC_BASE_URL ?? null,
    explicitSyntheticBaseUrl: process.env.V2_SYNTHETIC_BASE_URL ?? null,
    host: config.host,
    port: config.port,
  }));

  const result = controlPlaneService.setCutoverMode(
    {
      authenticated: true,
      keyFingerprint: 'local-script',
      operatorId: readFlag('--operator') ?? 'local-script',
      principal: 'operator_key',
      scheme: 'x-operator-key',
    },
    {
      mode: requireMode(),
      reason: readFlag('--reason') ?? 'local_cutover_mode_change',
    },
  );

  console.log(JSON.stringify(result));
} finally {
  database.close();
}
