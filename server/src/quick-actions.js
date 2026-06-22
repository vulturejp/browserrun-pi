export const quickActionNames = new Set(['screenshot', 'content', 'pdf', 'snapshot', 'links', 'scrape']);

export function quickActionToJob(actionName, input) {
  if (!quickActionNames.has(actionName)) {
    const error = new Error('unsupported quick action');
    error.statusCode = 501;
    throw error;
  }

  const base = {
    url: input.url,
    timeoutMs: input.timeoutMs,
    viewport: input.viewport,
    userAgent: input.userAgent,
    headers: input.headers,
    fingerprintProfile: input.fingerprintProfile,
    locale: input.locale,
    timezoneId: input.timezoneId
  };

  switch (actionName) {
    case 'screenshot':
      return {
        ...base,
        actions: [{ type: 'screenshot', name: input.name || 'screenshot.png', fullPage: input.fullPage !== false }]
      };
    case 'content':
      return {
        ...base,
        actions: [
          { type: 'html', name: input.name || 'content.html' },
          { type: 'evaluate', name: 'content-text.json', expression: 'document.body ? document.body.innerText : ""' }
        ]
      };
    case 'pdf':
      return {
        ...base,
        actions: [{ type: 'pdf', name: input.name || 'page.pdf', format: input.format || 'A4' }]
      };
    case 'snapshot':
      return {
        ...base,
        actions: [{ type: 'snapshot', name: input.name || 'snapshot.json' }]
      };
    case 'links':
      return {
        ...base,
        actions: [{ type: 'links', name: input.name || 'links.json' }]
      };
    case 'scrape':
      return {
        ...base,
        actions: [{ type: 'scrape', selector: input.selector || 'body', attribute: input.attribute, name: input.name || 'scrape.json' }]
      };
    default:
      throw new Error(`Unhandled quick action: ${actionName}`);
  }
}
