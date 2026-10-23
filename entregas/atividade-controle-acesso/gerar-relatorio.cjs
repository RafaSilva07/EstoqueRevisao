const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const result = JSON.parse(readFileSync(path.join(__dirname, 'resultado-jest.json'), 'utf8'));
const tests = result.testResults.flatMap((suite) => suite.assertionResults);
const userRoutes = tests.filter((test) => /^(GET|POST|PATCH|DELETE) \/users(?:\/| )/.test(test.title)
  && test.title.endsWith('exige ADMIN além das permissões'));
if (!result.success || result.wasInterrupted || result.numFailedTests !== 0
  || result.numPendingTests !== 0 || result.numTodoTests !== 0 || result.numTotalTestSuites !== 2
  || tests.length !== result.numTotalTests || tests.some((test) => test.status !== 'passed')
  || userRoutes.length !== 7) {
  throw new Error('A evidencia exige as duas suites aprovadas, sem ignorados, incluindo as sete rotas de usuarios.');
}
const sources = JSON.parse(readFileSync(path.join(__dirname, 'manifesto-fontes.json'), 'utf8'));
for (const item of sources) {
  const original = readFileSync(path.join(root, item.source));
  const snapshot = readFileSync(path.join(__dirname, item.snapshot));
  if (!original.equals(snapshot) || createHash('sha256').update(original).digest('hex') !== item.sha256) {
    throw new Error(`A copia diverge do codigo do projeto: ${item.source}`);
  }
}
const executedAt = new Date(result.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const duration = (Math.max(...result.testResults.map((suite) => suite.endTime)) - result.startTime) / 1000;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const summary = [
  'ATIVIDADE PRATICA - CONTROLE DE ACESSO',
  'Funcionalidade: gestao de usuarios. Controle existente: AdminGuard + @UseGuards(AdminGuard).',
  `Execucao: ${executedAt} (America/Sao_Paulo)`,
  'HTTP local e guards reais; identidades simuladas e servicos dubles; sem banco de dados.',
  '',
  ...result.testResults.flatMap((suite) => [
    path.relative(root, suite.name),
    ...suite.assertionResults.map((test) => `PASS ${test.title} (${test.duration} ms)`),
    '',
  ]),
  `Test Suites: ${result.numPassedTestSuites} passed, ${result.numTotalTestSuites} total`,
  `Tests: ${result.numPassedTests} passed, ${result.numTotalTests} total`,
  `Failed: ${result.numFailedTests}; Skipped: ${result.numPendingTests}`,
  `Time: ${duration.toFixed(3)} s`,
  '',
  'Recorte da funcionalidade: 7 rotas /users com 403 para perfis sem ADMIN e 2xx para ADMIN.',
  'A suite HTTP completa inclui tambem outras operacoes; todos os resultados estao acima.',
  '',
  ...sources.map((item) => `SHA-256 ${item.source}: ${item.sha256}`),
  '',
  'Fonte: resultado-jest.json exportado pelo Jest. Nenhum teste ou controle de producao foi alterado.',
].join('\n');
writeFileSync(path.join(__dirname, 'resultado-execucao.txt'), summary + '\n');
writeFileSync(path.join(__dirname, 'relatorio-testes.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Controle de acesso | Resultado real do Jest</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#172b3a;font:16px/1.4 system-ui,sans-serif}
main{max-width:1160px;margin:26px auto;background:white;padding:30px 38px;border:1px solid #dce2e8;border-radius:12px}
.eyebrow{color:#586979;font-size:13px;font-weight:650;letter-spacing:1px}h1{font-size:29px;margin:6px 0}p{margin:5px 0}
.muted{color:#586979}.success{margin:20px 0;padding:16px 20px;background:#16803c;color:white;border-radius:7px;font-weight:700;font-size:23px}
.stats{display:flex;gap:44px;margin:0 0 20px}.stats strong{font-size:25px;display:block}.stats span{font-size:14px;color:#586979}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:11px 10px;text-align:left;border-bottom:1px solid #dce2e8}th{font-size:12px;text-transform:uppercase;color:#586979}
.pass{font-weight:750;color:#16803c;white-space:nowrap}.details{background:#f4f6f8;padding:15px 18px;margin-top:20px;font-size:13px;overflow-wrap:anywhere}.details p{margin:5px 0}
code{font-family:Consolas,monospace;font-size:12px}.foot{margin-top:14px;font-size:12px;color:#586979}
</style></head><body><main>
<div class="eyebrow">ESTOQUEREVISAO · ATIVIDADE PRÁTICA</div>
<h1>Controle de acesso — Gestão de usuários</h1>
<p class="muted">Controle já existente: <code>AdminGuard</code> aplicado ao <code>UsersController</code></p>
<div class="success">✓ ${result.numPassedTests}/${result.numTotalTests} TESTES APROVADOS — 100%</div>
<div class="stats"><div><strong>${result.numPassedTestSuites}</strong><span>suítes aprovadas</span></div><div><strong>${result.numFailedTests}</strong><span>falhas</span></div><div><strong>${result.numPendingTests}</strong><span>ignorados</span></div><div><strong>${userRoutes.length}</strong><span>rotas /users verificadas</span></div><div><strong>${duration.toFixed(2)} s</strong><span>tempo total</span></div></div>
<p><b>Risco documentado:</b> operador sem perfil ADMIN tenta acessar diretamente a gestão de contas.</p>
<p class="muted">Asserções: HTTP 403 para perfis sem ADMIN; serviço não chamado; HTTP 2xx para ADMIN.</p>
<table><thead><tr><th>Resultado</th><th>Teste HTTP existente — recorte da funcionalidade escolhida</th><th>Tempo</th></tr></thead><tbody>
${userRoutes.map((test) => `<tr><td class="pass">✓ PASS</td><td>${escape(test.title)}</td><td style="white-space:nowrap">${test.duration} ms</td></tr>`).join('\n')}
</tbody></table>
<div class="details"><p><b>Execução:</b> ${escape(executedAt)} (America/Sao_Paulo)</p>
<p><b>Reprodução:</b> <code>node entregas/atividade-controle-acesso/executar.cjs</code></p>
<p><b>Suítes originais:</b> <code>users.spec.ts</code> e <code>admin-operations.spec.ts</code></p>
<p><b>Evidências:</b> <code>resultado-jest.json</code>, <code>resultado-execucao.txt</code> e <code>manifesto-fontes.json</code></p>
<p><b>Escopo:</b> HTTP local e guards reais; sessões simuladas e serviços dublês; sem acesso ao banco.</p></div>
<p class="foot">Relatório gerado a partir do JSON real do Jest. O total inclui todas as verificações das duas suítes; a tabela destaca as 7 rotas de usuários. Nenhum controle ou teste existente foi alterado.</p>
</main></body></html>\n`);
console.log(summary);
