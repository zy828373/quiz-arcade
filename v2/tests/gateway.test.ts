import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
import { writeCutoverModeFile } from '../src/control/cutover.ts';
import { closeHttpServer, createHttpServer, listenHttpServer } from '../src/gateway/http-server.ts';
import { ParallelGateway } from '../src/gateway/parallel-gateway.ts';
import { HealthService } from '../src/health/health-service.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

type CapturedUpstreamRequest = {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
};

function createTestConfig(rootDirectory: string): AppConfig {
  const dataDirectory = join(rootDirectory, 'data');

  return {
    serviceName: 'codex-pool-v2',
    version: '0.7.0-phase6',
    stage: 'stage6',
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    logLevel: 'error',
    dataDirectory,
    databasePath: join(dataDirectory, 'control-plane.sqlite'),
    workspaceRoot: rootDirectory,
    authSources: {
      team: join(rootDirectory, 'auths_team'),
      free: join(rootDirectory, 'auths_free'),
    },
    scheduler: {
      mode: 'shadow',
      sourceTypeBias: {
        team: 0,
        free: 0,
      },
      readyScoreBonus: 12,
      degradedScorePenalty: 18,
      latestHealthDegradedPenalty: 10,
      refreshStalePenalty: 14,
      recentSyncFailureSignalPenalty: 6,
      expiringSoonHours: 24,
      expiringSoonPenalty: 20,
      failurePenaltyPerFailure: 15,
      recoveryProbePenalty: 25,
      cooldownMinutes: 15,
      rateLimitCooldownMinutes: 30,
      authErrorQuarantineMinutes: 360,
      recoveryProbeDelayMinutes: 5,
      successesToReady: 2,
      failuresToCooldown: 2,
      failuresToQuarantine: 4,
    },
  };
}

function writeAuthFixture(directoryPath: string, fileName: string): void {
  writeFileSync(
    join(directoryPath, fileName),
    JSON.stringify(
      {
        access_token: 'dummy-access-token',
        account_id: 'team-active',
        disabled: false,
        email: 'team-active@example.com',
        expired: '2099-01-01T00:00:00.000Z',
        id_token: 'dummy-id-token',
        last_refresh: '2026-04-09T00:00:00.000Z',
        refresh_token: 'dummy-refresh-token',
        type: 'codex',
      },
      null,
      2,
    ),
  );
}

function writeGatewayRuntimeFiles(rootDirectory: string, upstreamPort: number, timeoutMs = 500): void {
  writeFileSync(
    join(rootDirectory, 'config_team.yaml'),
    `port: ${upstreamPort}\napi-keys:\n  - "team-upstream-key"\n`,
  );
  writeFileSync(
    join(rootDirectory, 'proxy_config.json'),
    JSON.stringify(
      {
        acceptedApiKeys: ['client-key-1'],
        requestTimeout: timeoutMs,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: upstreamPort,
      },
      null,
      2,
    ),
  );
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += Buffer.from(chunk).toString('utf8');
  }

  return body;
}

async function startMockUpstreamServer(delayMs = 0): Promise<{
  requests: CapturedUpstreamRequest[];
  server: Server;
}> {
  const requests: CapturedUpstreamRequest[] = [];
  const server = createServer(async (req, res) => {
    const rawBody = await readRequestBody(req);
    const body = rawBody
      ? JSON.parse(rawBody) as Record<string, unknown>
      : null;

    requests.push({
      authorization: typeof req.headers.authorization === 'string' ? req.headers.authorization : null,
      body,
      method: req.method ?? 'GET',
      path: req.url ?? '/',
    });

    const respond = () => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'gpt-5.4',
                object: 'model',
                created: 1,
                owned_by: 'openai',
              },
            ],
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        if (body?.stream === true) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
          res.write(`data: ${JSON.stringify({
            id: 'chatcmpl-stream',
            model: 'gpt-5.4',
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })}\n\n`);
          res.write(`data: ${JSON.stringify({
            id: 'chatcmpl-stream',
            model: 'gpt-5.4',
            choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
          })}\n\n`);
          res.write(`data: ${JSON.stringify({
            id: 'chatcmpl-stream',
            model: 'gpt-5.4',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-json',
            object: 'chat.completion',
            model: 'gpt-5.4',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'upstream hello',
                },
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 5,
            },
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    };

    if (delayMs > 0) {
      setTimeout(respond, delayMs);
      return;
    }

    respond();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return { requests, server };
}

async function startMockUpstreamServerWithNullJsonContent(): Promise<{
  requests: CapturedUpstreamRequest[];
  server: Server;
}> {
  const requests: CapturedUpstreamRequest[] = [];
  const server = createServer(async (req, res) => {
    const rawBody = await readRequestBody(req);
    const body = rawBody
      ? JSON.parse(rawBody) as Record<string, unknown>
      : null;

    requests.push({
      authorization: typeof req.headers.authorization === 'string' ? req.headers.authorization : null,
      body,
      method: req.method ?? 'GET',
      path: req.url ?? '/',
    });

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      if (body?.stream === true) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream-repair',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-5.4',
          choices: [{ index: 0, delta: { role: 'assistant', content: 'repaired hello' }, finish_reason: null }],
        })}\n\n`);
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream-repair',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-5.4',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop', native_finish_reason: 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 6, total_tokens: 17 },
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-json-null',
          object: 'chat.completion',
          model: 'gpt-5.4',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              native_finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: null,
                reasoning_content: null,
                tool_calls: null,
              },
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 5,
            total_tokens: 16,
          },
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return { requests, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function createGatewayHarness(timeoutMs = 500, upstreamDelayMs = 0): Promise<{
  config: AppConfig;
  database: DatabaseManager;
  logger: Logger;
  requests: CapturedUpstreamRequest[];
  rootDirectory: string;
  server: ReturnType<typeof createHttpServer>;
  serviceUrl: string;
  upstreamServer: Server;
}> {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-gateway-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'gateway' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });
  writeAuthFixture(config.authSources.team, 'team-active.json');

  const { requests, server: upstreamServer } = await startMockUpstreamServer(upstreamDelayMs);
  const upstreamPort = (upstreamServer.address() as AddressInfo).port;
  writeGatewayRuntimeFiles(rootDirectory, upstreamPort, timeoutMs);
  writeCutoverModeFile(rootDirectory, {
    mode: 'parallel',
    reason: 'gateway_test_parallel_mode',
    updatedAt: '2026-04-10T00:00:00.000Z',
    updatedBy: 'test-suite',
  });

  const database = new DatabaseManager(config, logger);
  database.initialize();
  syncAccountRegistry(config, database, logger);

  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(config, database, scheduler);
  const parallelGateway = new ParallelGateway(
    { workspaceRoot: config.workspaceRoot },
    scheduler,
    logger,
  );
  const server = createHttpServer({
    config,
    healthService,
    logger,
    parallelGateway,
  });

  await listenHttpServer(server, '127.0.0.1', 0);
  const port = (server.address() as AddressInfo).port;

  return {
    config,
    database,
    logger,
    requests,
    rootDirectory,
    server,
    serviceUrl: `http://127.0.0.1:${port}`,
    upstreamServer,
  };
}

async function createGatewayHarnessWithNullJsonContent(): Promise<{
  config: AppConfig;
  database: DatabaseManager;
  logger: Logger;
  requests: CapturedUpstreamRequest[];
  rootDirectory: string;
  server: ReturnType<typeof createHttpServer>;
  serviceUrl: string;
  upstreamServer: Server;
}> {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-gateway-null-json-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'gateway-null-json' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });
  writeAuthFixture(config.authSources.team, 'team-active.json');

  const { requests, server: upstreamServer } = await startMockUpstreamServerWithNullJsonContent();
  const upstreamPort = (upstreamServer.address() as AddressInfo).port;
  writeGatewayRuntimeFiles(rootDirectory, upstreamPort, 500);
  writeCutoverModeFile(rootDirectory, {
    mode: 'parallel',
    reason: 'gateway_test_parallel_mode',
    updatedAt: '2026-04-10T00:00:00.000Z',
    updatedBy: 'test-suite',
  });

  const database = new DatabaseManager(config, logger);
  database.initialize();
  syncAccountRegistry(config, database, logger);

  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(config, database, scheduler);
  const parallelGateway = new ParallelGateway(
    { workspaceRoot: config.workspaceRoot },
    scheduler,
    logger,
  );
  const server = createHttpServer({
    config,
    healthService,
    logger,
    parallelGateway,
  });

  await listenHttpServer(server, '127.0.0.1', 0);
  const port = (server.address() as AddressInfo).port;

  return {
    config,
    database,
    logger,
    requests,
    rootDirectory,
    server,
    serviceUrl: `http://127.0.0.1:${port}`,
    upstreamServer,
  };
}

async function destroyGatewayHarness(harness: {
  database: DatabaseManager;
  rootDirectory: string;
  server: ReturnType<typeof createHttpServer>;
  upstreamServer: Server;
}): Promise<void> {
  await closeHttpServer(harness.server);
  await closeServer(harness.upstreamServer);
  harness.database.close();
  rmSync(harness.rootDirectory, { recursive: true, force: true });
}

test('parallel gateway proxies models/chat/messages and records observational decisions', async () => {
  const harness = await createGatewayHarness();

  try {
    const modelsBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;
    const modelsResponse = await fetch(`${harness.serviceUrl}/v1/models`, {
      headers: {
        Authorization: 'Bearer client-key-1',
      },
    });
    const modelsPayload = await modelsResponse.json() as { data: Array<{ id: string }> };
    const modelsAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;

    assert.equal(modelsResponse.status, 200);
    assert.equal(modelsResponse.headers.get('x-codex-gateway-mode'), 'parallel');
    assert.equal(modelsPayload.data.some((entry) => entry.id === 'gpt-5.4'), true);
    assert.equal(modelsPayload.data.some((entry) => entry.id === 'claude-sonnet-4-5'), true);
    assert.equal(modelsBefore, modelsAfter);

    const openAiResponse = await fetch(`${harness.serviceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer client-key-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Hello gateway' }],
      }),
    });
    const openAiPayload = await openAiResponse.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const openAiDecision = (
      harness.database.db.prepare(`
        SELECT decision_id, request_context_json
        FROM routing_decisions
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as { decision_id: string; request_context_json: string }
    );
    const openAiContext = JSON.parse(openAiDecision.request_context_json) as Record<string, unknown>;

    assert.equal(openAiResponse.status, 200);
    assert.equal(openAiPayload.choices[0]?.message.content, 'upstream hello');
    assert.equal(openAiResponse.headers.get('x-codex-shadow-decision-id'), openAiDecision.decision_id);
    assert.equal(openAiResponse.headers.get('x-codex-execution-disposition'), 'observational_execution');
    assert.equal(openAiContext.decisionSource, 'gateway_proxy');
    assert.equal(openAiContext.executionDisposition, 'observational_execution');
    assert.equal(openAiContext.routePath, '/v1/chat/completions');

    const anthropicResponse = await fetch(`${harness.serviceUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'client-key-1',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        system: [{ type: 'text', text: 'Be concise' }],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Ping' }] }],
        max_tokens: 128,
      }),
    });
    const anthropicPayload = await anthropicResponse.json() as {
      content: Array<{ text: string; type: string }>;
      model: string;
      type: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    const decisionCount = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;

    assert.equal(anthropicResponse.status, 200);
    assert.equal(anthropicPayload.type, 'message');
    assert.equal(anthropicPayload.model, 'claude-sonnet-4-5');
    assert.equal(anthropicPayload.content[0]?.text, 'upstream hello');
    assert.equal(anthropicPayload.usage.output_tokens, 5);
    assert.equal(decisionCount, 2);
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.requests.every((entry) => entry.authorization === 'Bearer team-upstream-key'), true);

    const anthropicUpstreamRequest = harness.requests[harness.requests.length - 1];
    assert.equal(anthropicUpstreamRequest.path, '/v1/chat/completions');
    assert.equal(anthropicUpstreamRequest.body?.model, 'gpt-5.4');
    assert.equal(
      Array.isArray(anthropicUpstreamRequest.body?.messages),
      true,
    );
    const upstreamMessages = anthropicUpstreamRequest.body?.messages as Array<Record<string, unknown>>;
    assert.equal(upstreamMessages[0]?.role, 'system');
    assert.equal(upstreamMessages[0]?.content, 'Be concise');
    assert.equal(upstreamMessages[1]?.role, 'user');
    assert.equal(upstreamMessages[1]?.content, 'Ping');
  } finally {
    await destroyGatewayHarness(harness);
  }
});

test('parallel gateway supports OpenAI passthrough SSE and Anthropic SSE adaptation', async () => {
  const harness = await createGatewayHarness();

  try {
    const openAiStreamResponse = await fetch(`${harness.serviceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer client-key-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Stream please' }],
        stream: true,
      }),
    });
    const openAiStreamBody = await openAiStreamResponse.text();

    assert.equal(openAiStreamResponse.status, 200);
    assert.equal(
      openAiStreamResponse.headers.get('content-type')?.includes('text/event-stream'),
      true,
    );
    assert.equal(openAiStreamBody.includes('data: [DONE]'), true);
    assert.equal(openAiStreamBody.includes('hello'), true);

    const anthropicStreamResponse = await fetch(`${harness.serviceUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'client-key-1',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'Stream please' }],
        stream: true,
      }),
    });
    const anthropicStreamBody = await anthropicStreamResponse.text();

    assert.equal(anthropicStreamResponse.status, 200);
    assert.equal(
      anthropicStreamResponse.headers.get('content-type')?.includes('text/event-stream'),
      true,
    );
    assert.equal(anthropicStreamBody.includes('event: message_start'), true);
    assert.equal(anthropicStreamBody.includes('event: content_block_delta'), true);
    assert.equal(anthropicStreamBody.includes('event: message_stop'), true);
    assert.equal(anthropicStreamBody.includes('hello'), true);
  } finally {
    await destroyGatewayHarness(harness);
  }
});

test('parallel gateway applies unified auth and timeout error mapping without leaking write side effects on auth failure', async () => {
  const harness = await createGatewayHarness(50, 200);

  try {
    const unauthorizedResponse = await fetch(`${harness.serviceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const unauthorizedPayload = await unauthorizedResponse.json() as {
      error: { code: string; type: string };
    };
    const decisionCountAfterUnauthorized = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;

    assert.equal(unauthorizedResponse.status, 401);
    assert.equal(unauthorizedPayload.error.code, 'invalid_api_key');
    assert.equal(unauthorizedPayload.error.type, 'authentication_error');
    assert.equal(decisionCountAfterUnauthorized, 0);

    const timeoutResponse = await fetch(`${harness.serviceUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'client-key-1',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'timeout please' }],
      }),
    });
    const timeoutPayload = await timeoutResponse.json() as {
      error: { message: string; type: string };
      type: string;
    };
    const decisionCountAfterTimeout = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;

    assert.equal(timeoutResponse.status, 504);
    assert.equal(timeoutPayload.type, 'error');
    assert.equal(timeoutPayload.error.type, 'api_error');
    assert.equal(timeoutPayload.error.message, 'Upstream request timed out');
    assert.equal(decisionCountAfterTimeout, 1);
  } finally {
    await destroyGatewayHarness(harness);
  }
});

test('parallel gateway repairs null OpenAI JSON content by replaying upstream stream output', async () => {
  const harness = await createGatewayHarnessWithNullJsonContent();

  try {
    const response = await fetch(`${harness.serviceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer client-key-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Repair please' }],
      }),
    });
    const payload = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { total_tokens: number };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.choices[0]?.message.content, 'repaired hello');
    assert.equal(payload.usage.total_tokens, 17);
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.requests[0]?.body?.stream, undefined);
    assert.equal(harness.requests[1]?.body?.stream, true);
  } finally {
    await destroyGatewayHarness(harness);
  }
});
