const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'apps', 'backend');
const sources = [
  'apps/backend/src/modules/users/admin.guard.ts',
  'apps/backend/src/modules/users/users.controller.ts',
  'apps/backend/src/modules/users/users.spec.ts',
  'apps/backend/src/modules/auth/admin-operations.spec.ts',
];

mkdirSync(path.join(__dirname, 'codigo-fonte'), { recursive: true });
const result = spawnSync(process.execPath, [
  require.resolve('jest/bin/jest'),
  '--config', 'jest.config.cjs', '--runInBand', '--verbose',
  '--runTestsByPath', 'src/modules/users/users.spec.ts', 'src/modules/auth/admin-operations.spec.ts',
  '--json', `--outputFile=${path.join(__dirname, 'resultado-jest.json')}`,
], {
  cwd: backend,
  env: { ...process.env, TEST_DATABASE_URL: '' },
  stdio: 'inherit', windowsHide: true, timeout: 300_000,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const manifest = sources.map((source) => {
  const snapshot = `codigo-fonte/${path.basename(source)}`;
  const original = path.join(root, source);
  copyFileSync(original, path.join(__dirname, snapshot));
  return { source, snapshot, sha256: createHash('sha256').update(readFileSync(original)).digest('hex') };
});
writeFileSync(path.join(__dirname, 'manifesto-fontes.json'), JSON.stringify(manifest, null, 2) + '\n');

for (const script of ['gerar-relatorio.cjs', 'capturar-relatorio.cjs']) {
  const step = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', windowsHide: true });
  if (step.error) throw step.error;
  if (step.status !== 0) process.exit(step.status ?? 1);
}
