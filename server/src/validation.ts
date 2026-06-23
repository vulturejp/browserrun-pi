export type FingerprintProfile = 'none' | 'standard' | 'mobile';
export type Viewport = { width: number; height: number };
export type JobAction = Record<string, unknown> & { type: string };
export type JobPayload = {
  url: string;
  timeoutMs: number;
  viewport: Viewport;
  userAgent?: string;
  headers: Record<string, string>;
  fingerprintProfile: FingerprintProfile;
  locale?: string;
  timezoneId?: string;
  actions: JobAction[];
};

type ConfigLike = {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  defaultFingerprintProfile?: FingerprintProfile;
};

const allowedActionTypes = new Set(['wait', 'click', 'type', 'evaluate', 'screenshot', 'pdf', 'html', 'snapshot', 'links', 'scrape']);
const fingerprintProfiles = new Set<FingerprintProfile>(['none', 'standard', 'mobile']);

export function validateJob(input: unknown, config: ConfigLike): JobPayload {
  if (!isObject(input)) {
    throw badRequest('Request body must be a JSON object.');
  }

  const url = normalizeUrl(input.url);
  const timeoutMs = validateTimeout(input.timeoutMs, config);
  const viewport = validateViewport(input.viewport);
  const userAgent = validateOptionalString(input.userAgent, 'userAgent', 512);
  const headers = validateHeaders(input.headers);
  const fingerprintProfile = validateFingerprintProfile(input.fingerprintProfile, config);
  const locale = validateOptionalString(input.locale, 'locale', 64);
  const timezoneId = validateOptionalString(input.timezoneId, 'timezoneId', 128);
  const actions = validateActions(input.actions);

  return {
    url,
    timeoutMs,
    viewport,
    userAgent,
    headers,
    fingerprintProfile,
    locale,
    timezoneId,
    actions
  };
}

export function sanitizeArtifactName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 160) {
    throw badRequest('Artifact name must be a non-empty string up to 160 characters.');
  }
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..' || name.includes('..')) {
    throw badRequest('Artifact name must not contain path separators or traversal.');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw badRequest('Artifact name may only contain letters, numbers, dots, underscores, and dashes.');
  }
  return name;
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) {
    throw badRequest('url must be a string.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw badRequest('url must be an absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest('url must use http or https.');
  }
  return parsed.toString();
}

function validateTimeout(value: unknown, config: ConfigLike): number {
  if (value === undefined) return config.defaultTimeoutMs;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1000 || value > config.maxTimeoutMs) {
    throw badRequest(`timeoutMs must be an integer between 1000 and ${config.maxTimeoutMs}.`);
  }
  return value;
}

function validateViewport(value: unknown): Viewport {
  if (value === undefined) return { width: 1280, height: 720 };
  if (!isObject(value)) throw badRequest('viewport must be an object.');
  const { width, height } = value;
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 320 || width > 3840) {
    throw badRequest('viewport.width must be an integer between 320 and 3840.');
  }
  if (typeof height !== 'number' || !Number.isInteger(height) || height < 240 || height > 2160) {
    throw badRequest('viewport.height must be an integer between 240 and 2160.');
  }
  return { width, height };
}

function validateHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isObject(value)) throw badRequest('headers must be an object.');
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key)) {
      throw badRequest(`Invalid header name: ${key}`);
    }
    headers[key] = validateOptionalString(headerValue, `headers.${key}`, 2048) || '';
  }
  return headers;
}

function validateActions(value: unknown): JobAction[] {
  if (value === undefined) return [{ type: 'screenshot', name: 'screenshot.png', fullPage: true }];
  if (!Array.isArray(value) || value.length > 25) {
    throw badRequest('actions must be an array with at most 25 entries.');
  }
  return value.map((action, index) => validateAction(action, index));
}

function validateAction(action: unknown, index: number): JobAction {
  if (!isObject(action)) throw badRequest(`actions[${index}] must be an object.`);
  if (typeof action.type !== 'string') throw badRequest(`actions[${index}].type must be a string.`);
  if (!allowedActionTypes.has(action.type)) throw badRequest(`actions[${index}].type is not supported.`);

  switch (action.type) {
    case 'wait':
      if (typeof action.ms !== 'number' || !Number.isInteger(action.ms) || action.ms < 0 || action.ms > 30000) {
        throw badRequest(`actions[${index}].ms must be an integer between 0 and 30000.`);
      }
      return { type: 'wait', ms: action.ms };
    case 'click':
      return {
        type: 'click',
        selector: requireString(action.selector, `actions[${index}].selector`, 1000),
        timeoutMs: optionalInteger(action.timeoutMs, `actions[${index}].timeoutMs`, 100, 30000)
      };
    case 'type':
      return {
        type: 'type',
        selector: requireString(action.selector, `actions[${index}].selector`, 1000),
        text: requireString(action.text, `actions[${index}].text`, 10000),
        timeoutMs: optionalInteger(action.timeoutMs, `actions[${index}].timeoutMs`, 100, 30000)
      };
    case 'evaluate':
      return {
        type: 'evaluate',
        expression: requireString(action.expression, `actions[${index}].expression`, 20000),
        name: sanitizeArtifactName(action.name || `evaluate-${index}.json`)
      };
    case 'screenshot':
      return {
        type: 'screenshot',
        name: sanitizeArtifactName(action.name || `screenshot-${index}.png`),
        fullPage: action.fullPage !== false
      };
    case 'pdf':
      return {
        type: 'pdf',
        name: sanitizeArtifactName(action.name || `page-${index}.pdf`),
        format: validateOptionalString(action.format, `actions[${index}].format`, 32) || 'A4'
      };
    case 'html':
      return {
        type: 'html',
        name: sanitizeArtifactName(action.name || `page-${index}.html`)
      };
    case 'snapshot':
      return {
        type: 'snapshot',
        name: sanitizeArtifactName(action.name || `snapshot-${index}.json`)
      };
    case 'links':
      return {
        type: 'links',
        name: sanitizeArtifactName(action.name || `links-${index}.json`)
      };
    case 'scrape':
      return {
        type: 'scrape',
        selector: requireString(action.selector, `actions[${index}].selector`, 1000),
        name: sanitizeArtifactName(action.name || `scrape-${index}.json`),
        attribute: validateOptionalString(action.attribute, `actions[${index}].attribute`, 128)
      };
    default:
      throw badRequest(`actions[${index}].type is not supported.`);
  }
}

function validateFingerprintProfile(value: unknown, config: ConfigLike): FingerprintProfile {
  const profile = value === undefined ? (config.defaultFingerprintProfile || 'standard') : value;
  if (!isFingerprintProfile(profile)) {
    throw badRequest('fingerprintProfile must be one of: none, standard, mobile.');
  }
  return profile;
}

function validateOptionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label, maxLength);
}

function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw badRequest(`${label} must be a string up to ${maxLength} characters.`);
  }
  return value;
}

function optionalInteger(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFingerprintProfile(value: unknown): value is FingerprintProfile {
  return typeof value === 'string' && fingerprintProfiles.has(value as FingerprintProfile);
}

function badRequest(message: string): Error & { statusCode: number } {
  const error: any = new Error(message);
  error.statusCode = 400;
  return error;
}
