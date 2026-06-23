import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';

type FingerprintProfile = 'none' | 'standard' | 'mobile';
type Viewport = { width: number; height: number };
type RunnerAction = Record<string, unknown> & { type: string; name?: string };
type RunnerJob = {
  url: string;
  timeoutMs: number;
  viewport?: Viewport;
  userAgent?: string;
  headers?: Record<string, string>;
  fingerprintProfile?: FingerprintProfile;
  locale?: string;
  timezoneId?: string;
  actions?: RunnerAction[];
};
type FingerprintSettings = {
  viewport?: Viewport;
  userAgent?: string;
  locale: string;
  timezoneId: string;
  headers: Record<string, string>;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  colorScheme: 'light' | 'dark' | 'no-preference';
  reducedMotion: 'reduce' | 'no-preference';
  initScript: string;
};

const jobFile = process.argv[2] || '/work/job.json';
const artifactDir = process.argv[3] || '/artifacts';

const job = JSON.parse(await fs.readFile(jobFile, 'utf8')) as RunnerJob;
await fs.mkdir(artifactDir, { recursive: true });

const fingerprint = buildFingerprint(job);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSERRUN_CHROMIUM_PATH || undefined,
  args: [
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,BackForwardCache',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check'
  ]
});

let context;
try {
  context = await browser.newContext({
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    isMobile: fingerprint.isMobile,
    hasTouch: fingerprint.hasTouch,
    colorScheme: fingerprint.colorScheme,
    reducedMotion: fingerprint.reducedMotion,
    extraHTTPHeaders: fingerprint.headers
  });

  if (fingerprint.initScript) {
    await context.addInitScript(fingerprint.initScript);
  }

  context.setDefaultTimeout(Math.min(job.timeoutMs, 30000));
  const page = await context.newPage();
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: job.timeoutMs });

  for (const action of job.actions || []) {
    await runAction(page, action);
  }

  await writeJson('result.json', {
    ok: true,
    url: page.url(),
    title: await page.title()
  });
} catch (error) {
  const caught = error instanceof Error ? error : new Error(String(error));
  await writeJson('error.json', {
    ok: false,
    name: caught.name,
    message: caught.message,
    stack: caught.stack
  });
  throw error;
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

async function runAction(page: Page, action: RunnerAction): Promise<void> {
  switch (action.type) {
    case 'wait':
      await page.waitForTimeout(numberValue(action.ms, 0));
      return;
    case 'click':
      await page.click(stringValue(action.selector), { timeout: optionalNumberValue(action.timeoutMs) });
      return;
    case 'type':
      await page.fill(stringValue(action.selector), stringValue(action.text), { timeout: optionalNumberValue(action.timeoutMs) });
      return;
    case 'evaluate': {
      const value = await page.evaluate(stringValue(action.expression));
      await writeJson(requiredName(action), value);
      return;
    }
    case 'screenshot':
      await page.screenshot({
        path: artifactPath(requiredName(action)),
        fullPage: action.fullPage !== false
      });
      return;
    case 'pdf':
      await page.pdf({
        path: artifactPath(requiredName(action)),
        format: typeof action.format === 'string' ? action.format : 'A4',
        printBackground: true
      });
      return;
    case 'html':
      await fs.writeFile(artifactPath(requiredName(action)), await page.content(), 'utf8');
      return;
    case 'snapshot':
      await writeJson(requiredName(action), await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        text: document.body ? document.body.innerText : '',
        html: document.documentElement ? document.documentElement.outerHTML : ''
      })));
      return;
    case 'links':
      await writeJson(requiredName(action), await page.evaluate(() => Array.from(document.links).map((link) => ({
        href: link.href,
        text: link.innerText || link.textContent || '',
        rel: link.rel || ''
      }))));
      return;
    case 'scrape':
      await writeJson(requiredName(action), await page.evaluate(({ selector, attribute }: { selector: string; attribute?: string }) => {
        return Array.from(document.querySelectorAll(selector)).map((node) => {
          if (attribute) return node.getAttribute(attribute);
          const element = node as HTMLElement;
          return {
            text: element.innerText || element.textContent || '',
            html: element.outerHTML || ''
          };
        });
      }, { selector: stringValue(action.selector), attribute: typeof action.attribute === 'string' ? action.attribute : undefined }));
      return;
    default:
      throw new Error(`Unsupported action: ${action.type}`);
  }
}

function artifactPath(name: string): string {
  return path.join(artifactDir, name);
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await fs.writeFile(artifactPath(name), JSON.stringify(value, null, 2), 'utf8');
}

function buildFingerprint(input: RunnerJob): FingerprintSettings {
  const profile = input.fingerprintProfile || 'standard';
  const locale = input.locale || 'en-US';
  const timezoneId = input.timezoneId || 'Asia/Tokyo';
  const standardUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const mobileUserAgent = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

  if (profile === 'none') {
    return {
      viewport: input.viewport,
      userAgent: input.userAgent,
      locale,
      timezoneId,
      headers: input.headers || {},
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      initScript: ''
    };
  }

  const isMobile = profile === 'mobile';
  const viewport = input.viewport || (isMobile ? { width: 390, height: 844 } : { width: 1280, height: 720 });
  const userAgent = input.userAgent || (isMobile ? mobileUserAgent : standardUserAgent);
  const headers = {
    'Accept-Language': `${locale},en;q=0.9`,
    ...(input.headers || {})
  };

  return {
    viewport,
    userAgent,
    locale,
    timezoneId,
    headers,
    deviceScaleFactor: isMobile ? 2 : 1,
    isMobile,
    hasTouch: isMobile,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    initScript: fingerprintInitScript({ isMobile, locale })
  };
}

function fingerprintInitScript({ isMobile, locale }: { isMobile: boolean; locale: string }): string {
  const hardwareConcurrency = isMobile ? 8 : 4;
  const deviceMemory = isMobile ? 8 : 4;
  const platform = isMobile ? 'Linux armv8l' : 'Linux x86_64';
  return `
(() => {
  const defineGetter = (object, property, getter) => {
    try {
      Object.defineProperty(object, property, { get: getter, configurable: true });
    } catch {}
  };
  defineGetter(Navigator.prototype, 'webdriver', () => undefined);
  defineGetter(Navigator.prototype, 'hardwareConcurrency', () => ${hardwareConcurrency});
  defineGetter(Navigator.prototype, 'deviceMemory', () => ${deviceMemory});
  defineGetter(Navigator.prototype, 'platform', () => ${JSON.stringify(platform)});
  defineGetter(Navigator.prototype, 'language', () => ${JSON.stringify(locale)});
  defineGetter(Navigator.prototype, 'languages', () => [${JSON.stringify(locale)}, 'en']);
  defineGetter(Navigator.prototype, 'plugins', () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }]);
  defineGetter(Navigator.prototype, 'mimeTypes', () => [{ type: 'application/pdf' }]);
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Google Inc. (Intel)';
    if (parameter === 37446) return 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620, OpenGL 4.6)';
    return getParameter.call(this, parameter);
  };
  const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) => {
      if (parameters && parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return originalQuery.call(window.navigator.permissions, parameters);
    };
  }
})();
`;
}

function requiredName(action: RunnerAction): string {
  if (typeof action.name !== 'string') throw new Error(`${action.type} action requires name`);
  return action.name;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string action value');
  return value;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
