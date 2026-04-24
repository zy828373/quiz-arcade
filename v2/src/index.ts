import { createAppConfig } from './config/app-config.ts';
import { resolveServiceBaseUrls } from './control/cutover.ts';
import { ControlPlaneRouter } from './control/control-router.ts';
import { ControlPlaneService } from './control/control-service.ts';
import { closeHttpServer, createHttpServer, listenHttpServer } from './gateway/http-server.ts';
import { ParallelGateway } from './gateway/parallel-gateway.ts';
import { HealthService } from './health/health-service.ts';
import { DatabaseManager } from './ledger/database.ts';
import { Logger } from './logging/logger.ts';
import { ShadowScheduler } from './routing/shadow-scheduler.ts';

const config = createAppConfig();
const logger = new Logger(config.logLevel, {
  service: config.serviceName,
  stage: config.stage,
});

const database = new DatabaseManager(config, logger.child({ component: 'sqlite' }));
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
const controlPlaneRouter = new ControlPlaneRouter(
  { workspaceRoot: config.workspaceRoot },
  controlPlaneService,
  logger.child({ component: 'control_http' }),
);
const parallelGateway = new ParallelGateway(
  { workspaceRoot: config.workspaceRoot },
  scheduler,
  logger.child({ component: 'gateway' }),
);
const server = createHttpServer({
  config,
  healthService,
  logger: logger.child({ component: 'http' }),
  controlPlaneRouter,
  parallelGateway,
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('service.stopping', { signal });

  await closeHttpServer(server);
  database.close();

  logger.info('service.stopped', { signal });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await listenHttpServer(server, config.host, config.port);
  const address = server.address();
  if (address && typeof address !== 'string') {
    controlPlaneService.setServiceBaseUrls(resolveServiceBaseUrls({
      explicitPublicBaseUrl: process.env.V2_PUBLIC_BASE_URL ?? null,
      explicitSyntheticBaseUrl: process.env.V2_SYNTHETIC_BASE_URL ?? null,
      host: config.host,
      port: address.port,
    }));
  }

  logger.info('service.started', {
    cutoverMode: controlPlaneService.getCutover().currentMode,
    host: config.host,
    port: config.port,
    databasePath: config.databasePath,
    schemaVersion: database.getMetadataValue('schema_version'),
  });
} catch (error) {
  logger.error('service.start_failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  database.close();
  process.exitCode = 1;
}
