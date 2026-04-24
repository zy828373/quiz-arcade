import { createServer, type Server, type ServerResponse } from 'node:http';

import type { AppConfig } from '../config/app-config.ts';
import { ControlPlaneRouter } from '../control/control-router.ts';
import { HealthService } from '../health/health-service.ts';
import { Logger } from '../logging/logger.ts';
import { ParallelGateway } from './parallel-gateway.ts';

type HttpServerDependencies = {
  config: Pick<AppConfig, 'host' | 'port' | 'serviceName' | 'version' | 'stage'>;
  healthService: HealthService;
  logger: Logger;
  controlPlaneRouter?: ControlPlaneRouter;
  parallelGateway?: ParallelGateway;
};

function writeJson(
  statusCode: number,
  payload: unknown,
  res: ServerResponse,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export function createHttpServer(dependencies: HttpServerDependencies): Server {
  const { config, healthService, logger, parallelGateway, controlPlaneRouter } = dependencies;

  return createServer((req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const url = requestUrl.pathname;

    void (async () => {
      if (method === 'GET' && (url === '/' || url === '/health' || url === '/healthz')) {
        const payload =
          url === '/'
            ? {
                service: config.serviceName,
                version: config.version,
                stage: config.stage,
                healthEndpoint: '/health',
              }
            : healthService.snapshot();

        writeJson(200, payload, res);
        return;
      }

      if (method === 'GET' && url === '/health/summary') {
        writeJson(200, healthService.getHealthSummary(requestUrl.searchParams.get('timestamp')), res);
        return;
      }

      if (method === 'GET' && url === '/health/services') {
        writeJson(200, healthService.getLatestServiceSnapshots(), res);
        return;
      }

      if (method === 'GET' && url === '/health/accounts') {
        writeJson(200, healthService.getLatestAccountSnapshots(), res);
        return;
      }

      if (controlPlaneRouter && (await controlPlaneRouter.handleRequest(req, res))) {
        return;
      }

      if (parallelGateway && (await parallelGateway.handleRequest(req, res))) {
        return;
      }

      if (method === 'GET' && url === '/scheduler/preview') {
        writeJson(
          200,
          healthService.scheduler.preview({
            model: requestUrl.searchParams.get('model'),
            protocol: requestUrl.searchParams.get('protocol'),
            timestamp: requestUrl.searchParams.get('timestamp'),
          }),
          res,
        );
        return;
      }

      if (method === 'GET' && url === '/runtime/accounts') {
        writeJson(200, healthService.scheduler.getRuntimeAccounts(requestUrl.searchParams.get('timestamp')), res);
        return;
      }

      logger.warn('http.not_found', { method, url });
      writeJson(404, { error: `Unknown endpoint: ${method} ${url}` }, res);
    })().catch((error) => {
      logger.error('http.unhandled_error', {
        error: error instanceof Error ? error.message : String(error),
        method,
        url,
      });

      if (!res.headersSent) {
        writeJson(500, { error: 'Internal server error' }, res);
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });
}

export function listenHttpServer(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

export function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
