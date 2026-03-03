// Central configuration — reads from environment variables at build time
export const GAS_URL = import.meta.env.VITE_GOOGLE_APP_SCRIPT_URL || '';
export const PASS_THRESHOLD = Number(import.meta.env.VITE_PASS_THRESHOLD) || 8;
export const QUESTION_COUNT = Number(import.meta.env.VITE_QUESTION_COUNT) || 10;
