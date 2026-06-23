import path from 'node:path';
import type { FingerprintProfile } from './validation.js';

export type RunnerPreset = 'low-memory' | 'balanced' | 'quality';

export type AppConfig = {
  host: string;
  port: number;
  apiToken: string;
  allowNoAuth: boolean;
  artifactRoot: string;
  containerRuntime: string;
  runnerImage: string;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  defaultMinIntervalHours: number;
  defaultFingerprintProfile: FingerprintProfile;
  runnerPreset: RunnerPreset;
  tunnelEndpoint: string;
  memoryLimit: string;
  cpus: string;
  network: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const allowNoAuth = env.BROWSERRUN_ALLOW_NO_AUTH === '1';
  const apiToken = env.BROWSERRUN_API_TOKEN || '';

  if (!allowNoAuth && apiToken.length < 12) {
    throw new Error('Set BROWSERRUN_API_TOKEN to at least 12 characters, or set BROWSERRUN_ALLOW_NO_AUTH=1 for local development.');
  }

  const root = env.BROWSERRUN_ARTIFACT_ROOT || path.resolve(process.cwd(), 'artifacts');

  return {
    host: env.BROWSERRUN_HOST || '127.0.0.1',
    port: parseInteger(env.BROWSERRUN_PORT, 8787, 1, 65535),
    apiToken,
    allowNoAuth,
    artifactRoot: path.resolve(root),
    containerRuntime: env.BROWSERRUN_CONTAINER_RUNTIME || 'docker',
    runnerImage: env.BROWSERRUN_RUNNER_IMAGE || 'browserrun-pi-runner:latest',
    defaultTimeoutMs: parseInteger(env.BROWSERRUN_DEFAULT_TIMEOUT_MS, 60000, 1000, 300000),
    maxTimeoutMs: parseInteger(env.BROWSERRUN_MAX_TIMEOUT_MS, 120000, 1000, 600000),
    defaultMinIntervalHours: parseInteger(env.BROWSERRUN_DEFAULT_MIN_INTERVAL_HOURS, 168, 1, 8760),
    defaultFingerprintProfile: parseChoice(env.BROWSERRUN_FINGERPRINT_PROFILE, 'standard', ['none', 'standard', 'mobile']),
    runnerPreset: parseChoice(env.BROWSERRUN_RUNNER_PRESET, 'balanced', ['low-memory', 'balanced', 'quality']),
    tunnelEndpoint: env.BROWSERRUN_TUNNEL_ENDPOINT || '',
    memoryLimit: env.BROWSERRUN_MEMORY || '1g',
    cpus: env.BROWSERRUN_CPUS || '2',
    network: env.BROWSERRUN_NETWORK || 'bridge'
  };
}

function parseInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function parseChoice<T extends string>(value: string | undefined, fallback: T, choices: readonly T[]): T {
  if (value === undefined || value === '') return fallback;
  if (!(choices as readonly string[]).includes(value)) {
    throw new Error(`Invalid choice value: ${value}`);
  }
  return value as T;
}
