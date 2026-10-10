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

test('migração: edviz.code antigo vira o buffer da aba ativa', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('edviz.code', 'let antigo = 1;\n');
    localStorage.setItem('edviz.example', 'pilha-array');
  });
  await page.goto('/');
  await expect(page.locator('#code')).toHaveValue('let antigo = 1;\n');
  await page.reload();
  await expect(page.locator('#code')).toHaveValue('let antigo = 1;\n');
});

test('abas do editor: navegação por teclado (EU-08)', async ({ page }) => {
  await page.goto('/');
  await trocarExemplo(page, 'fila-array');
  const nomes = page.locator('#tabs .tab .tab-name');
  await expect(nomes).toHaveCount(2);
  /* as setas movem o foco sem ativar a aba */
  await nomes.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(nomes.nth(1)).toBeFocused();
  await expect(page.locator('#tabs .tab.active')).toHaveAttribute('data-tab', 'fila-array');
  /* Enter ativa a aba focada */
  await page.keyboard.press('ArrowLeft');
  await expect(nomes.first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tabs .tab.active')).toHaveAttribute('data-tab', 'pilha-array');
  await expect(page.locator('#tabs .tab.active .tab-name')).toHaveAttribute('aria-current', 'true');
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

test('BST remoção: a duplicada aparece na fase com nós e no seletor (regressão)', async ({ page }) => {
  await page.goto('/');
  await executarPausado(page, 'arvore-bst-remocao');
  /* passa pelo fim (a seleção gruda na árvore principal vazia) e volta para a
   * fase da duplicada — o mesmo caminho do defeito relatado */
  await page.click('#btnLast');
  await page.evaluate(() => {
    const s = document.getElementById('slider');
    s.value = '799'; /* passo 800 de 873: a duplicada tem 3 nós */
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#structure .canvas-title')).toHaveText('Árvore binária');
  await expect(page.locator('#structure .canvas-sub')).toContainText('duplicada · 3 nós');
  await expect(page.locator('#structure .tree-node')).toHaveCount(3);

  /* o seletor lista a duplicada; escolhê-la mantém a exibição nela */
  await expect(page.locator('#structureSelect option', { hasText: 'Árvore binária — duplicada' })).toHaveCount(1);
  await page.selectOption('#structureSelect', { label: 'Árvore binária — duplicada' });
  await page.click('#btnNext');
  await expect(page.locator('#structure .canvas-sub')).toContainText('duplicada');

  /* a árvore principal continua selecionável à mão (vazia neste passo) */
  await page.selectOption('#structureSelect', { label: 'Árvore binária — arvore' });
  await expect(page.locator('#structure')).toContainText('A árvore está vazia neste passo.');
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

test('comandos: BST e lista mostram as operações da estrutura (P2)', async ({ page }) => {
  await page.goto('/');
  await executarPausado(page, 'arvore-bst');
  await page.click('#btnLast');
  await page.click('#tabCommands');
  const cmds = page.locator('#commands');
  await expect(cmds).toContainText('Inserção');
  await expect(cmds).toContainText('Busca');
  await expect(cmds).toContainText('Percurso');
  await expect(cmds).not.toContainText('Nenhuma operação');

  await executarPausado(page, 'lista-simples');
  await page.click('#btnLast');
  await expect(cmds).toContainText('Inserção no início');
  await expect(cmds).not.toContainText('push(');
});

test('janela estreita: reenquadra sozinho após mexer na câmera (P3)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await executarPausado(page, 'lista-encadeada');
  await page.click('#btnLast');
  await page.click('#btnZoomIn'); /* usuário mexeu na câmera: o auto-fit antigo desligava */
  await page.setViewportSize({ width: 500, height: 820 });
  await page.waitForFunction(() => {
    const vp = document.querySelector('#structure .canvas-viewport');
    const nodes = Array.from(document.querySelectorAll('#structure .list-node'));
    if (!vp || !nodes.length) return false;
    const r = vp.getBoundingClientRect();
    return nodes.every((n) => {
      const q = n.getBoundingClientRect();
      return q.left >= r.left - 2 && q.right <= r.right + 2;
    });
  }, null, { timeout: 5000 });
});

test('status-line quebra em vez de truncar a linha em execução (P5)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.getElementById('code').value =
      'const resultadoFinalDaOperacao = [1, 2, 3, 4, 5, 6].map(function (x) { return x * 123456; }).join(" - ");\n' +
      'console.log(resultadoFinalDaOperacao);';
  });
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '\u275a\u275a') await page.click('#btnPlay');
  await page.evaluate(() => {
    const b = document.getElementById('btnFirst');
    if (!b.disabled) b.click();
  });
  const r = await page.evaluate(() => {
    const el = document.getElementById('statusLine');
    return { truncado: el.scrollWidth > el.clientWidth + 1, texto: el.textContent };
  });
  expect(r.texto).toContain('resultadoFinalDaOperacao');
  expect(r.truncado).toBe(false);
});
