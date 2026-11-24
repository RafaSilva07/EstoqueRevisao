const { spawnSync } = require('node:child_process');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const transientConnectionError = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|57P0[123]|53300|XX000|ENOTFOUND|tenant|getaddrinfo|Connection terminated unexpectedly/i;
const executable = process.execPath;
const cli = require.resolve('typeorm/cli-ts-node-commonjs.js');
const args = process.argv.slice(2);

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const result = spawnSync(executable, [cli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (result.error) process.stderr.write(`${result.error.message}\n`);

  if (result.status === 0) {
    process.stdout.write('\n[DEPLOY] Comando de migrations concluído no PostgreSQL.\n');
    process.exit(0);
  }

  const output = `${stdout}\n${stderr}`;
  const isConnectionError = transientConnectionError.test(output);
  const canRetry = attempt < MAX_ATTEMPTS && isConnectionError;
  if (!canRetry) {
    if (isConnectionError) {
      process.stderr.write('\n[DEPLOY] Falha de conexão com o PostgreSQL. Verifique se o projeto está ativo e se a conexão está correta.\n');
    }
    process.exit(result.status || 1);
  }

  process.stderr.write(`Conexão PostgreSQL interrompida. Nova tentativa ${attempt + 1}/${MAX_ATTEMPTS} em ${RETRY_DELAY_MS / 1000}s...\n`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
}
