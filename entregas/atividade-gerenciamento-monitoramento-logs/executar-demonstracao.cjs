const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputDir = __dirname;
const outputFile = path.join(outputDir, 'resultado-demonstracao.txt');

console.log('======================================================================');
console.log('DEMONSTRAÇÃO: GERENCIAMENTO E MONITORAMENTO DE LOGS');
console.log('Fábrica de Software — EstoqueRevisao');
console.log('======================================================================\n');

let outputContent = `======================================================================
EVIDÊNCIA DE EXECUÇÃO: GERENCIAMENTO E MONITORAMENTO DE LOGS
Projeto: EstoqueRevisao
Branch: atividade/gerenciamento-monitoramento-logs
Data/Hora: ${new Date().toISOString()}
======================================================================\n\n`;

try {
  console.log('▶ Executando testes automatizados de observabilidade, simulação e métricas...');
  const testOutput = execSync(
    'npm run test --workspace @estoque-revisao/backend -- system-logs products-failure --verbose',
    { encoding: 'utf-8', cwd: path.resolve(__dirname, '../..') }
  );

  console.log(testOutput);
  outputContent += `[RESULTADO DOS TESTES AUTOMATIZADOS (JEST)]\n${testOutput}\n\n`;
} catch (error) {
  const errOutput = error.stdout || error.stderr || error.message;
  console.error(errOutput);
  outputContent += `[ERRO NA EXECUÇÃO DOS TESTES]\n${errOutput}\n\n`;
}

fs.writeFileSync(outputFile, outputContent, 'utf-8');
console.log(`\n✔ Evidência de execução salva com sucesso em: ${outputFile}`);
