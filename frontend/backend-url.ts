export function resolveBackendUrl(value?: string): URL {
  const configured = value || 'http://127.0.0.1:8080';
  return new URL(configured.includes('://') ? configured : `http://${configured}`);
}
