import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

export const v2Root = resolve(currentDirectory, '..');
export const repoRoot = resolve(v2Root, '..');
