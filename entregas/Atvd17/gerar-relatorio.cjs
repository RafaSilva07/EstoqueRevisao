const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

// Renderiza somente resultados reais exportados pelo Jest; nao executa testes.
const result = JSON.parse(readFileSync(path.join(__dirname, 'resultado-jest.json'), 'utf8'));
const assertions = result.testResults.flatMap((suite) => suite.assertionResults);
if (!result.success || result.numFailedTests !== 0 || result.numPendingTests !== 0
  || result.numTotalTests !== 3 || assertions.length !== 3
  || assertions.some((test) => test.status !== 'passed')) {
  throw new Error('O relatorio de aprovacao exige os tres testes aprovados, sem falhas ou ignorados.');
}
const sourcePath = 'apps/backend/src/modules/products/products-persistence.integration.spec.ts';
const source = readFileSync(path.join(__dirname, '..', sourcePath));
const snapshot = readFileSync(path.join(__dirname, 'codigo-fonte/products-persistence.integration.spec.ts'));
if (!source.equals(snapshot)) throw new Error('A copia para entrega difere do teste do projeto.');
const hash = createHash('sha256').update(source).digest('hex');
const executedAt = new Date(result.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const duration = (Math.max(...result.testResults.map((suite) => suite.endTime)) - result.startTime) / 1000;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const summary = [
  'ATIVIDADE - OPCAO B: CAMADA DE PERSISTENCIA',
  'NestJS + TypeORM + Jest + PostgreSQL real',
  `Execucao: ${executedAt} (America/Sao_Paulo)`,
  'Comando: npm run test:atividade',
  `Arquivo: ${sourcePath}`,
  '',
  ...assertions.map((test) => `PASS ${test.title} (${test.duration} ms)`),
  '',
  `Test Suites: ${result.numPassedTestSuites} passed, ${result.numTotalTestSuites} total`,
  `Tests: ${result.numPassedTests} passed, ${result.numTotalTests} total`,
  `Failed: ${result.numFailedTests}; Skipped: ${result.numPendingTests}`,
  `Time: ${duration.toFixed(3)} s`,
  `SHA-256 do codigo-fonte: ${hash}`,
  '',
  'Fonte dos resultados: resultado-jest.json, exportado pelo Jest.',
].join('\n');
writeFileSync(path.join(__dirname, 'resultado-execucao.txt'), summary + '\n');
writeFileSync(path.join(__dirname, 'relatorio-testes.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Atividade 17 | Resultado real do Jest</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#172b3a;font:16px/1.45 system-ui,sans-serif}
main{max-width:1120px;margin:28px auto;background:white;padding:32px 40px;border:1px solid #dce2e8;border-radius:12px}
.eyebrow{color:#586979;font-size:13px;font-weight:650;letter-spacing:1px}h1{font-size:29px;margin:6px 0 4px}p{margin:5px 0}
.muted{color:#586979}.success{margin:22px 0 20px;padding:17px 22px;background:#16803c;color:white;border-radius:7px;font-weight:700;font-size:23px}
.stats{display:flex;gap:45px;margin:0 0 22px}.stats strong{font-size:25px;display:block}.stats span{font-size:14px;color:#586979}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{padding:14px 10px;text-align:left;border-bottom:1px solid #dce2e8}th{font-size:12px;text-transform:uppercase;color:#586979}
.pass{font-weight:750;color:#16803c;white-space:nowrap}.details{background:#f4f6f8;padding:16px 20px;margin-top:22px;font-size:13px;overflow-wrap:anywhere}.details p{margin:4px 0}
code{font-family:Consolas,monospace;font-size:12px}.foot{margin-top:14px;font-size:12px;color:#586979}
</style></head><body><main>
<div class="eyebrow">ESTOQUEREVISAO · ATIVIDADE 17</div>
<h1>Opção B — Camada de Persistência</h1>
<p class="muted">Teste de integração · NestJS + TypeORM + Jest · PostgreSQL real</p>
<div class="success">✓ ${result.numPassedTests}/${result.numTotalTests} TESTES APROVADOS — 100%</div>
<div class="stats"><div><strong>${result.numPassedTestSuites}</strong><span>suíte aprovada</span></div><div><strong>${result.numPassedTests}</strong><span>testes aprovados</span></div><div><strong>${result.numFailedTests}</strong><span>falhas</span></div><div><strong>${result.numPendingTests}</strong><span>ignorados</span></div><div><strong>${duration.toFixed(2)} s</strong><span>tempo total</span></div></div>
<table><thead><tr><th>Resultado</th><th>Teste executado pelo Jest</th><th>Tempo</th></tr></thead><tbody>
${assertions.map((test) => `<tr><td class="pass">✓ PASS</td><td>${escape(test.title)}</td><td style="white-space:nowrap">${test.duration} ms</td></tr>`).join('\n')}
</tbody></table>
<div class="details"><p><b>Execução:</b> ${escape(executedAt)} (America/Sao_Paulo)</p>
<p><b>Comando:</b> <code>npm run test:atividade</code></p>
<p><b>Teste:</b> <code>${sourcePath}</code></p>
<p><b>Banco isolado:</b> <code>estoque_revisao_atividade_test</code> · migrations reais · rollback por teste</p>
<p><b>Evidência:</b> <code>resultado-jest.json</code> (saída original do Jest)</p>
<p><b>SHA-256 do código:</b> <code>${hash}</code></p></div>
<p class="foot">Relatório gerado automaticamente a partir do JSON do Jest. A barra verde depende de todos os testes aprovados, sem falhas ou testes ignorados.</p>
</main></body></html>\n`);
console.log(summary);
