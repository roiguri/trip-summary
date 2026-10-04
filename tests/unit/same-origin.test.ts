// The same-site check for state-changing requests, including behind a proxy whose internal URL
// differs from the site's address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin } from '../../lib/auth/same-origin.ts';

const req = (url: string, headers: Record<string, string>) =>
  new Request(url, { method: 'POST', headers });
const SITE = 'https://journal.example';

test('a request from the site itself passes, also behind a proxy', () => {
  assert.equal(sameOrigin(req(`${SITE}/api/x`, { origin: SITE })), true);
  // The server's own URL is internal; the proxy forwards the site's host.
  assert.equal(
    sameOrigin(
      req('http://internal:3000/api/x', { origin: SITE, 'x-forwarded-host': 'journal.example' }),
    ),
    true,
  );
  assert.equal(
    sameOrigin(req('http://internal:3000/api/x', { origin: SITE, host: 'journal.example' })),
    true,
  );
  assert.equal(
    sameOrigin(req('http://localhost:3100/api/x', { origin: 'http://localhost:3100' })),
    true,
    'plain HTTP on a local machine',
  );
});

test('another site, plain HTTP, or no Origin is refused', () => {
  assert.equal(
    sameOrigin(req(`${SITE}/api/x`, { origin: 'https://evil.example', host: 'journal.example' })),
    false,
  );
  assert.equal(
    sameOrigin(req(`${SITE}/api/x`, { origin: 'http://journal.example', host: 'journal.example' })),
    false,
    'HTTP from the site’s own host',
  );
  assert.equal(sameOrigin(req(`${SITE}/api/x`, { host: 'journal.example' })), false, 'no Origin');
  assert.equal(sameOrigin(req(`${SITE}/api/x`, { origin: 'null' })), false);
  assert.equal(
    sameOrigin(
      req('http://internal:3000/api/x', {
        origin: 'https://journal.example.evil.example',
        'x-forwarded-host': 'journal.example',
      }),
    ),
    false,
    'a look-alike host',
  );
});
