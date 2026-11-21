#!/usr/bin/env node
// Synchronizes the Docker Hub repository description from files in this repository.
//
//   node scripts/dockerhub-description.cjs --dry-run   validate only, no network, no secrets
//   node scripts/dockerhub-description.cjs             validate and update Docker Hub
//
// The update needs DOCKERHUB_USERNAME and DOCKERHUB_TOKEN (a Docker Hub personal access
// token with write access to the repository) in the environment. Without them the script
// fails instead of silently doing nothing. Secrets are never printed or stored.
// Logo and categories cannot be set by this script; see docs/DOCKERHUB.md and CONTRIBUTING.md.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const SHORT_DESCRIPTION_FILE = path.join(
  __dirname,
  '..',
  'docs',
  'DOCKERHUB.short.txt',
);
const FULL_DESCRIPTION_FILE = path.join(
  __dirname,
  '..',
  'docs',
  'DOCKERHUB.md',
);
const DEFAULT_REPOSITORY = 'milkrunner/gardenplanner';
const DEFAULT_API = 'https://hub.docker.com';
const MAX_SHORT = 100;
const MAX_FULL = 25000;

function loadDescriptions(files = {}) {
  const short = readFileSync(
    files.short || SHORT_DESCRIPTION_FILE,
    'utf8',
  ).trim();
  const full = readFileSync(files.full || FULL_DESCRIPTION_FILE, 'utf8');
  return { short, full };
}

function validate({ short, full }) {
  const errors = [];
  if (!short) errors.push('Short description is empty');
  if (short.length > MAX_SHORT)
    errors.push(
      `Short description has ${short.length} > ${MAX_SHORT} characters`,
    );
  if (/\r|\n/.test(short))
    errors.push('Short description must be a single line');
  if (!full.trim()) errors.push('Full description is empty');
  if (full.length > MAX_FULL)
    errors.push(`Full description has ${full.length} > ${MAX_FULL} characters`);
  return errors;
}

async function request(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  if (!response.ok) {
    // Status only: response bodies of auth endpoints must not leak into logs.
    throw new Error(
      `${options.method} ${new URL(url).pathname} failed with HTTP ${response.status}`,
    );
  }
  return response.json();
}

async function syncDescription(
  { short, full },
  env = process.env,
  fetchImpl = fetch,
) {
  const username = env.DOCKERHUB_USERNAME;
  const token = env.DOCKERHUB_TOKEN;
  if (!username || !token) {
    throw new Error(
      'DOCKERHUB_USERNAME and DOCKERHUB_TOKEN are required (use --dry-run to only validate)',
    );
  }
  const repository = env.DOCKERHUB_REPOSITORY || DEFAULT_REPOSITORY;
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid repository name: ${repository}`);
  }
  const api = (env.DOCKERHUB_API_URL || DEFAULT_API).replace(/\/$/, '');
  const login = await request(fetchImpl, `${api}/v2/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: token }),
  });
  if (!login.token) throw new Error('Docker Hub login returned no token');
  await request(fetchImpl, `${api}/v2/repositories/${repository}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `JWT ${login.token}`,
    },
    body: JSON.stringify({ description: short, full_description: full }),
  });
  return repository;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const descriptions = loadDescriptions();
  const errors = validate(descriptions);
  if (errors.length) {
    errors.forEach((error) => console.error(`error: ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Short description: ${descriptions.short.length}/${MAX_SHORT} characters`,
  );
  console.log(
    `Full description: ${descriptions.full.length}/${MAX_FULL} characters`,
  );
  if (dryRun) {
    console.log('Dry run: Docker Hub was not contacted.');
    return;
  }
  const repository = await syncDescription(descriptions);
  console.log(`Updated description of ${repository} on Docker Hub.`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  loadDescriptions,
  validate,
  syncDescription,
  MAX_SHORT,
  MAX_FULL,
};
