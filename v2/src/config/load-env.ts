import { existsSync, readFileSync } from 'node:fs';

function normalizeValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadEnvFile(envFilePath: string): void {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = normalizeValue(trimmed.slice(separatorIndex + 1));

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
