const http = require('node:http');
const {
  loadDescriptions,
  validate,
  syncDescription,
  MAX_SHORT,
} = require('../scripts/dockerhub-description.cjs');

describe('Docker Hub description', () => {
  test('repository files satisfy Docker Hub limits', () => {
    const descriptions = loadDescriptions();
    expect(validate(descriptions)).toEqual([]);
    expect(descriptions.short.length).toBeLessThanOrEqual(MAX_SHORT);
  });

  test('rejects an overlong or multi-line short description', () => {
    expect(
      validate({ short: 'x'.repeat(MAX_SHORT + 1), full: 'text' }),
    ).toHaveLength(1);
    expect(validate({ short: 'a\nb', full: 'text' })).toHaveLength(1);
    expect(validate({ short: '', full: '' })).toHaveLength(2);
  });

  test('documents the supported variables and no nonexistent latest tag', () => {
    const { full } = loadDescriptions();
    for (const variable of [
      'API_KEY',
      'PORT',
      'DATA_DIR',
      'LOG_DIR',
      'LOG_LEVEL',
      'MAX_LOG_SIZE',
    ]) {
      expect(full).toContain(`\`${variable}\``);
    }
    expect(full).not.toMatch(/`latest`\s*\|/);
  });

  test('refuses to run without credentials and never contacts the network', async () => {
    const fetchImpl = jest.fn();
    await expect(
      syncDescription({ short: 's', full: 'f' }, {}, fetchImpl),
    ).rejects.toThrow(/DOCKERHUB_USERNAME/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('logs in and patches the repository against a local mock API', async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body: JSON.parse(body),
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ token: 'mock-jwt' }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const env = {
        DOCKERHUB_USERNAME: 'user',
        DOCKERHUB_TOKEN: 'pat',
        DOCKERHUB_REPOSITORY: 'owner/repo',
        DOCKERHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
      };
      await syncDescription({ short: 'short', full: 'full' }, env);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/v2/users/login',
        auth: undefined,
        body: { username: 'user', password: 'pat' },
      },
      {
        method: 'PATCH',
        url: '/v2/repositories/owner/repo/',
        auth: 'JWT mock-jwt',
        body: { description: 'short', full_description: 'full' },
      },
    ]);
  });
});
