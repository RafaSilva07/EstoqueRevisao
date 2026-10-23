const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Exportacao do HTML local: perfil temporario, sem interagir com abas abertas.
const browser = [
  process.env.ACTIVITY_BROWSER_BINARY,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => candidate && existsSync(candidate));
if (!browser) throw new Error('Instale Chrome/Edge ou informe ACTIVITY_BROWSER_BINARY para exportar o print.');
const temporary = path.join(__dirname, '..', 'tmp');
mkdirSync(temporary, { recursive: true });
const profile = mkdtempSync(path.join(temporary, 'atividade-relatorio-'));
const output = path.join(__dirname, 'execucao-teste.png');
const report = path.join(__dirname, 'relatorio-testes.html');
if (!existsSync(report)) throw new Error('Execute gerar-relatorio.cjs antes da captura.');
const result = spawnSync(browser, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--hide-scrollbars',
  `--user-data-dir=${profile}`, '--window-size=1440,1000', '--virtual-time-budget=1000',
  `--screenshot=${output}`, pathToFileURL(report).href,
], { windowsHide: true, encoding: 'utf8', timeout: 60_000 });
if (result.error || result.status !== 0 || !existsSync(output)) {
  throw new Error(`Falha ao exportar a captura: ${result.error?.message ?? result.stderr}`);
}
const png = readFileSync(output);
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('A captura nao e um PNG valido.');
console.log(`Captura salva: ${output} (${png.readUInt32BE(16)} x ${png.readUInt32BE(20)})`);
