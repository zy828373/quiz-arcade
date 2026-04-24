import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

import { renderOpsConsole } from '../src/control/ops-page.ts';

class FakeElement {
  children: FakeElement[];
  className: string;
  dataset: Record<string, string>;
  id: string | null;
  listeners: Record<string, Array<(...args: unknown[]) => unknown>>;
  tagName: string;
  type: string;
  value: string;
  #innerHtml: string;
  #textContent: string;

  constructor(tagName: string, id: string | null = null) {
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.id = id;
    this.listeners = {};
    this.tagName = tagName.toUpperCase();
    this.type = '';
    this.value = '';
    this.#innerHtml = '';
    this.#textContent = '';
  }

  addEventListener(type: string, listener: (...args: unknown[]) => unknown): void {
    const currentListeners = this.listeners[type] ?? [];
    currentListeners.push(listener);
    this.listeners[type] = currentListeners;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [...children];
    this.#textContent = '';
    this.#innerHtml = '';
  }

  set textContent(value: string) {
    this.children = [];
    this.#innerHtml = '';
    this.#textContent = String(value ?? '');
  }

  get textContent(): string {
    if (this.children.length > 0) {
      return this.children.map((child) => child.textContent).join('');
    }

    return this.#textContent;
  }

  set innerHTML(value: string) {
    const rendered = String(value ?? '');
    this.children = [];
    this.#textContent = '';
    this.#innerHtml = rendered;

    if (rendered.includes('<img') || rendered.includes('<script')) {
      (globalThis as Record<string, unknown>).__dangerExecuted = true;
    }
  }

  get innerHTML(): string {
    return this.#innerHtml;
  }
}

class FakeDocument {
  #elements: Map<string, FakeElement>;

  constructor(ids: string[]) {
    this.#elements = new Map(ids.map((id) => [id, new FakeElement('div', id)]));
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  getElementById(id: string): FakeElement {
    const existing = this.#elements.get(id);
    if (existing) {
      return existing;
    }

    const created = new FakeElement('div', id);
    this.#elements.set(id, created);
    return created;
  }
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match?.[1], 'ops page should include an inline client script');
  return match[1];
}

test('ops page uses in-memory auth only and renders untrusted model strings via text nodes', () => {
  delete (globalThis as Record<string, unknown>).__dangerExecuted;

  const html = renderOpsConsole();
  assert.equal(html.includes('sessionStorage'), false);
  assert.equal(html.includes('localStorage'), false);
  assert.equal(html.includes('.innerHTML ='), false);
  assert.equal(html.includes('createElement('), true);
  assert.equal(html.includes('textContent ='), true);
  assert.equal(html.includes('id="platformTable"'), true);
  assert.equal(html.includes('id="runLocalRefresh"'), true);
  assert.equal(html.includes('id="stopTeamPool"'), true);
  assert.equal(html.includes('本机自用工作台'), true);
  assert.equal(html.includes('高级：人工动作与单项巡检'), true);
  assert.equal(html.includes('/control/activity'), true);
  assert.equal(html.includes('自动刷新状态'), true);

  const document = new FakeDocument([
    'statusLine',
    'operatorKey',
    'operatorId',
    'accountUid',
    'runtimeReason',
    'runtimeAction',
    'summaryCards',
    'platformTable',
    'accountsTable',
    'servicesTable',
    'readinessTable',
    'syntheticTable',
    'decisionsTable',
    'eventsTable',
    'summaryJson',
    'accountJson',
    'refreshButton',
    'clearButton',
    'applyRuntimeAction',
    'ensureTeamPool',
    'restartTeamPool',
    'stopTeamPool',
    'runLocalRefresh',
    'runAccountsSync',
    'runHealthProbe',
    'runSyntheticProbe',
    'runReadinessCheck',
  ]);
  const context = createContext({
    clearTimeout: () => undefined,
    document,
    fetch: async () => {
      throw new Error('fetch should not be called during this dry rendering test');
    },
    setTimeout: () => 1,
  });
  (context as Record<string, unknown>).globalThis = context;

  runInContext(extractInlineScript(html), context);

  const maliciousModel = '<img src=x onerror="globalThis.__dangerExecuted = true">';
  (context as Record<string, unknown>).__payload = {
    decisions: [
      {
        decisionId: 'decision-1',
        overallReady: true,
        requestedAt: '2026-04-09T10:00:00.000Z',
        requestedModel: maliciousModel,
        requestedProtocol: 'openai',
        selectedAccountUid: 'acct_safe',
      },
    ],
  };

  runInContext('renderDecisions(__payload);', context);

  const decisionsTable = document.getElementById('decisionsTable');
  assert.equal(decisionsTable.textContent.includes(maliciousModel), true);
  assert.equal((globalThis as Record<string, unknown>).__dangerExecuted, undefined);
});
