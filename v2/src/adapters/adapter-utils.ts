import { randomBytes } from 'node:crypto';

import { GatewayError } from '../gateway/errors.ts';
import type { NormalizedTextMessage } from '../gateway/models.ts';

type JsonObject = Record<string, unknown>;
type SupportedRole = NormalizedTextMessage['role'];

const SUPPORTED_ROLES = new Set<SupportedRole>(['assistant', 'system', 'tool', 'user']);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, fieldName: string): JsonObject {
  if (!isRecord(value)) {
    throw new GatewayError(400, 'invalid_request_error', `Expected object for ${fieldName}`, 'invalid_json_body');
  }

  return value;
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GatewayError(400, 'invalid_request_error', `Expected non-empty string for ${fieldName}`, 'invalid_request_body');
  }

  return value;
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function optionalBoolean(value: unknown, fieldName: string): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new GatewayError(400, 'invalid_request_error', `Expected boolean for ${fieldName}`, 'invalid_request_body');
  }

  return value;
}

export function optionalNumber(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new GatewayError(400, 'invalid_request_error', `Expected number for ${fieldName}`, 'invalid_request_body');
  }

  return value;
}

export function optionalStopSequence(value: unknown, fieldName: string): string | string[] | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value;
  }

  throw new GatewayError(400, 'invalid_request_error', `Expected string or string[] for ${fieldName}`, 'invalid_request_body');
}

function requireRole(value: unknown, fieldName: string): SupportedRole {
  const role = requireString(value, fieldName) as SupportedRole;
  if (!SUPPORTED_ROLES.has(role)) {
    throw new GatewayError(400, 'invalid_request_error', `Unsupported role for ${fieldName}`, 'unsupported_role');
  }

  return role;
}

export function extractTextContent(value: unknown, fieldName: string): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    throw new GatewayError(400, 'invalid_request_error', `Expected string or content blocks for ${fieldName}`, 'invalid_request_body');
  }

  const textParts: string[] = [];

  for (const [index, entry] of value.entries()) {
    if (typeof entry === 'string') {
      textParts.push(entry);
      continue;
    }

    if (!isRecord(entry)) {
      throw new GatewayError(400, 'invalid_request_error', `Invalid content block at ${fieldName}[${index}]`, 'invalid_request_body');
    }

    const blockType = typeof entry.type === 'string' ? entry.type : '';
    if ((blockType === 'text' || blockType === 'input_text' || blockType === '') && typeof entry.text === 'string') {
      textParts.push(entry.text);
    }
  }

  return textParts.join('\n');
}

export function normalizeOpenAIMessages(value: unknown, fieldName = 'messages'): NormalizedTextMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GatewayError(400, 'invalid_request_error', `${fieldName} must be a non-empty array`, 'invalid_request_body');
  }

  return value.map((entry, index) => {
    const message = requireObject(entry, `${fieldName}[${index}]`);

    return {
      role: requireRole(message.role, `${fieldName}[${index}].role`),
      content: extractTextContent(message.content, `${fieldName}[${index}].content`),
    };
  });
}

export function normalizeAnthropicSystem(value: unknown, fieldName = 'system'): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const content = extractTextContent(value, fieldName);
  return content === '' ? null : content;
}

export function normalizeAnthropicMessages(value: unknown, fieldName = 'messages'): NormalizedTextMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GatewayError(400, 'invalid_request_error', `${fieldName} must be a non-empty array`, 'invalid_request_body');
  }

  return value.map((entry, index) => {
    const message = requireObject(entry, `${fieldName}[${index}]`);

    return {
      role: requireRole(message.role, `${fieldName}[${index}].role`),
      content: extractTextContent(message.content, `${fieldName}[${index}].content`),
    };
  });
}

export function createAnthropicMessageId(): string {
  return `msg_${randomBytes(12).toString('hex')}`;
}

export function mapOpenAIFinishReason(value: unknown): 'end_turn' | 'max_tokens' | 'tool_use' {
  if (value === 'length') {
    return 'max_tokens';
  }

  if (value === 'tool_calls') {
    return 'tool_use';
  }

  return 'end_turn';
}

export function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
