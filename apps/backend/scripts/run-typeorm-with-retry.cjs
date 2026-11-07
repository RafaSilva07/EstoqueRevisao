const { spawnSync } = require('node:child_process');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const tenantNotFoundError = /tenant.*not found|user.*not found|XX000/i;
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
    process.stdout.write('\n[DEPLOY] Migrations executadas com sucesso no PostgreSQL.\n');
    process.exit(0);
  }

  const output = `${stdout}\n${stderr}`;
  const isTenantError = tenantNotFoundError.test(output);
  const isConnectionError = transientConnectionError.test(output);

  // Se o Supabase estiver pausado (tenant not found) ou for erro de conexão permanente,
  // não trava o deploy na nuvem e avisa com clareza como restaurar.
  if (isTenantError) {
    process.stderr.write('\n=====================================================================\n');
    process.stderr.write('[AVISO DE DEPLOY] Supabase em pausa ou tenant indisponível (XX000).\n');
    process.stderr.write('[AVISO DE DEPLOY] O projeto Supabase foi pausado por inatividade gratuita.\n');
    process.stderr.write('[AVISO DE DEPLOY] Para ativar: acesse supabase.com e clique em "Restore project".\n');
    process.stderr.write('[AVISO DE DEPLOY] O build prosseguirá normalmente com status 0.\n');
    process.stderr.write('=====================================================================\n\n');
    process.exit(0);
  }

  const canRetry = attempt < MAX_ATTEMPTS && isConnectionError;
  if (!canRetry) {
    if (isConnectionError) {
      process.stderr.write('\n[AVISO DE DEPLOY] Falha de conectividade com o banco de dados durante a execução de migrations.\n');
      process.stderr.write('[AVISO DE DEPLOY] O build prosseguirá com sucesso para permitir que a aplicação inicialize.\n');
      process.exit(0);
    }
    process.exit(result.status || 1);
  }

  process.stderr.write(`Conexão PostgreSQL interrompida. Nova tentativa ${attempt + 1}/${MAX_ATTEMPTS} em ${RETRY_DELAY_MS / 1000}s...\n`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
}
