const base = require('./jest.config.cjs');

// A suite recria o schema: aceite somente o banco local exclusivo da atividade.
const target = process.env.TEST_DATABASE_URL && new URL(process.env.TEST_DATABASE_URL);
if (!target || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  || target.pathname !== '/estoque_revisao_atividade_test') {
  throw new Error('Execute entregas/executar.ps1 ou configure TEST_DATABASE_URL com o banco local estoque_revisao_atividade_test.');
}

module.exports = {
  ...base,
  testRegex: 'products-persistence\\.integration\\.spec\\.ts$',
};
