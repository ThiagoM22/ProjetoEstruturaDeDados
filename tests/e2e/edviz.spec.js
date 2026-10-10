/* ED Viz — testes de ponta a ponta em navegador real (Playwright).
 *
 * Cobrem o que o DOM simulado não alcança: layout real, foco/teclado,
 * localStorage entre reloads, `file://`, reduced motion e memória.
 * Rodam em Chromium e Firefox (ver playwright.config.js).
 */
// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  /* animações desligadas: passos determinísticos para os testes */
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function trocarExemplo(page, id) {
  await page.evaluate((exId) => {
    const sel = document.getElementById('exampleSelect');
    sel.value = exId;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}

async function executarPausado(page, exemplo) {
  await trocarExemplo(page, exemplo);
  await page.click('#btnRun');
  const play = page.locator('#btnPlay');
  if ((await play.textContent()) === '❚❚') await play.click();
  const first = page.locator('#btnFirst');
  if (await first.isEnabled()) await first.click();
}

test('carrega, executa e navega o exemplo padrão', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ED Viz/);
  await expect(page.locator('#structure')).toContainText('Pilha');
  await executarPausado(page, 'pilha-array');
  await expect(page.locator('#stepLabel')).toHaveText(/passo 1\/\d+/);
  for (let i = 0; i < 3; i++) await page.click('#btnNext');
  await expect(page.locator('#stepLabel')).toHaveText(/passo 4\/\d+/);
  await expect(page.locator('#statusLine')).toContainText('linha');
  await page.click('#btnPrev');
  await expect(page.locator('#stepLabel')).toHaveText(/passo 3\/\d+/);
});

test('histórico: avançar e retroceder restaura o mesmo desenho', async ({ page }) => {
  await page.goto('/');
  await executarPausado(page, 'fila-array');
  const html0 = await page.locator('#structure').innerHTML();
  await page.click('#btnNext');
  await page.click('#btnNext');
  await page.click('#btnNext');
  const html3 = await page.locator('#structure').innerHTML();
  await page.click('#btnPrev');
  await page.click('#btnPrev');
  await page.click('#btnPrev');
  expect(await page.locator('#structure').innerHTML()).toBe(html0);
  await page.click('#btnNext');
  await page.click('#btnNext');
  await page.click('#btnNext');
  expect(await page.locator('#structure').innerHTML()).toBe(html3);
});

test('edição depois da execução avisa e suspende o destaque (EU-02)', async ({ page }) => {
  await page.goto('/');
  await executarPausado(page, 'pilha-array');
  await page.click('#btnNext');
  await page.fill('#code', 'let x = 1;\n');
  await expect(page.locator('#statusLine')).toContainText('editado');
  await expect(page.locator('#stepOp')).toHaveText('Código editado');
  await expect(page.locator('#lineHilite')).toBeHidden();
  await page.click('#btnNext');
  await expect(page.locator('#statusLine')).toContainText('editado');
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '❚❚') await page.click('#btnPlay');
  await expect(page.locator('#statusLine')).toContainText('linha');
});

test('debug: Tab/Enter não editam o código travado (EU-01)', async ({ page }) => {
  await page.goto('/');
  await executarPausado(page, 'pilha-array');
  await page.click('#btnDebug');
  await expect(page.locator('#code')).toHaveJSProperty('readOnly', true);
  const antes = await page.inputValue('#code');
  await page.locator('#code').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  expect(await page.inputValue('#code')).toBe(antes);
  await page.keyboard.press('Escape');
  await expect(page.locator('#code')).toHaveJSProperty('readOnly', false);
});

test('persistência: código por aba sobrevive à troca e ao reload (EU-09)', async ({ page }) => {
  await page.goto('/');
  await page.fill('#code', 'const pilha = [1];\npilha.push(2);');
  await trocarExemplo(page, 'fila-array');
  await expect(page.locator('#code')).toHaveValue(/fila/);
  await trocarExemplo(page, 'pilha-array');
  await expect(page.locator('#code')).toHaveValue('const pilha = [1];\npilha.push(2);');
  await page.reload();
  await expect(page.locator('#code')).toHaveValue('const pilha = [1];\npilha.push(2);');
});

test('abas do editor: navegação por teclado (EU-08)', async ({ page }) => {
  await page.goto('/');
  await trocarExemplo(page, 'fila-array');
  const tabs = page.locator('#tabs .tab');
  await expect(tabs).toHaveCount(2);
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabs .tab.active')).toHaveAttribute('data-tab', 'fila-array');
  await page.locator('#tabs .tab').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tabs .tab.active')).toHaveAttribute('data-tab', 'pilha-array');
});

test('funciona aberto direto do disco (file://)', async ({ page }) => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', '..', 'index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  await expect(page.locator('#structure')).toContainText('Pilha');
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '❚❚') await page.click('#btnPlay');
  await expect(page.locator('#stepLabel')).toHaveText(/passo \d+\/\d+/);
});

test('layout empilha em janela estreita', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/');
  await expect(page.locator('#splitLeft')).toBeHidden();
  await expect(page.locator('#splitRight')).toBeHidden();
  const colunas = await page.evaluate(() => getComputedStyle(document.getElementById('layout')).gridTemplateColumns);
  expect(colunas.trim().split(/\s+/).length).toBe(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator('#splitLeft')).toBeVisible();
});

test('sem erros de página durante uma execução', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto('/');
  await executarPausado(page, 'arvore-bst-remocao');
  await page.click('#btnNext');
  await page.click('#btnNext');
  expect(erros).toEqual([]);
});

test('trace longo executa e reporta memória (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'performance.memory só no Chromium');
  await page.goto('/');
  const r = await page.evaluate(() => {
    document.getElementById('code').value = 'const a = []; for (let i = 0; i < 6000; i++) { a.push(i % 50); }';
    const t0 = performance.now();
    document.getElementById('btnRun').click();
    const ms = performance.now() - t0;
    const steps = parseInt(document.getElementById('slider').max, 10);
    const mem = performance.memory ? performance.memory.usedJSHeapSize : -1;
    return { ms, steps, mem };
  });
  console.log('  [memória] passos=' + r.steps + ' exec=' + r.ms.toFixed(0) + 'ms heap=' + (r.mem / 1048576).toFixed(1) + 'MB');
  expect(r.steps).toBeGreaterThan(6000);
  expect(r.ms).toBeLessThan(5000);
});

test('botões têm nome acessível', async ({ page }) => {
  await page.goto('/');
  /* botões dentro de <select> são a marcação do select customizável (recurso
   * de navegadores compatíveis) — não são controles próprios */
  const semNome = await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .filter((b) => !b.closest('select'))
    .filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label'))).length);
  expect(semNome).toBe(0);
});
