// Existing formatting debt is allowed only while the file remains byte-identical.
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const prettier = require('prettier');
const baseline = require('./format-baseline.json');

async function main() {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  let failed = false;
  for (const file of [...new Set(files)]) {
    if (file === 'package-lock.json') continue;
    const info = await prettier.getFileInfo(file);
    if (!info.inferredParser) continue;
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const hash = createHash('sha256').update(source).digest('hex');
    if (baseline[file] === hash) continue;
    if (
      !(await prettier.check(source, {
        ...(await prettier.resolveConfig(file)),
        filepath: file,
      }))
    ) {
      console.error(
        `Formatting required: ${file} (run npx prettier --write "${file}")`,
      );
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
