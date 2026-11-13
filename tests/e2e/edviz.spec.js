/* ED Viz — testes de ponta a ponta em navegador real (Playwright).
 *
 * Cobrem o que o DOM simulado não alcança: layout real, foco/teclado,
 * localStorage entre reloads, reduced motion e memória.
 * Rodam em Chromium e Firefox (ver playwright.config.js).
 */
// @ts-check
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

/* O editor é uma gaveta: só existe na tela quando o aluno abre Código. */
async function abrirCodigo(page) {
  if (!(await page.locator('#codePanel').isVisible())) await page.click('#btnToggleCode');
  await expect(page.locator('#codePanel')).toBeVisible();
}

test('primeiro contato mostra a estrutura, não um palco vazio', async ({ page }) => {
  await page.goto('/visualizador.html');
  /* a primeira visita abre em um passo com conteúdo real do exemplo;
   * Executar continua reiniciando do passo 1 */
  const indice = await page.evaluate(() => parseInt(document.getElementById('slider').value, 10));
  expect(indice).toBeGreaterThan(0);
  await expect(page.locator('#canvasTitle')).toContainText('Pilha');
  expect(await page.locator('#structure .stack-cell').count()).toBeGreaterThan(0);
  await expect(page.locator('#structure')).not.toContainText('A pilha está vazia');
  /* o passo é uma prévia, não uma reprodução que o aluno pausou */
  await expect(page.locator('#vizRunStateText')).toHaveText('prévia');
  await page.click('#btnNext');
  await expect(page.locator('#vizRunStateText')).toHaveText('pausado');
});

test('trocar de exemplo abre em prévia, não em palco vazio', async ({ page }) => {
  await page.goto('/visualizador.html');
  await trocarExemplo(page, 'lista-dupla');
  await expect(page.locator('#vizRunStateText')).toHaveText('prévia');
  await expect(page.locator('#canvasTitle')).toContainText('Lista duplamente encadeada');
  const passo = await page.evaluate(() => parseInt(document.getElementById('slider').value, 10));
  expect(passo).toBeGreaterThan(0);
  expect(await page.locator('#structure .list-node').count()).toBeGreaterThan(0);
});

test('carrega, executa e navega o exemplo padrão', async ({ page }) => {
  await page.goto('/visualizador.html');
  await expect(page).toHaveTitle(/ED Viz/);
  await expect(page.locator('#canvasTitle')).toContainText('Pilha');
  await executarPausado(page, 'pilha-array');
  await expect(page.locator('#stepLabel')).toHaveText(/^1 \/ \d+$/);
  for (let i = 0; i < 3; i++) await page.click('#btnNext');
  await expect(page.locator('#stepLabel')).toHaveText(/^4 \/ \d+$/);
  await expect(page.locator('#statusLine')).toContainText('linha');
  await page.click('#btnPrev');
  await expect(page.locator('#stepLabel')).toHaveText(/^3 \/ \d+$/);
});

test('histórico: avançar e retroceder restaura o mesmo desenho', async ({ page }) => {
  await page.goto('/visualizador.html');
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
  await page.goto('/visualizador.html');
  await executarPausado(page, 'pilha-array');
  await page.click('#btnNext');
  await abrirCodigo(page);
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
  await page.goto('/visualizador.html');
  await executarPausado(page, 'pilha-array');
  await abrirCodigo(page);
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
  await page.goto('/visualizador.html');
  await abrirCodigo(page);
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
  await page.goto('/visualizador.html');
  await expect(page.locator('#code')).toHaveValue('let antigo = 1;\n');
  await page.reload();
  await expect(page.locator('#code')).toHaveValue('let antigo = 1;\n');
});

test('abas do editor: navegação por teclado (EU-08)', async ({ page }) => {
  await page.goto('/visualizador.html');
  await abrirCodigo(page);
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

test('cabeçalho do roteiro comporta várias abas sem vazar sobre o editor', async ({ page }) => {
  await page.goto('/visualizador.html');
  await abrirCodigo(page);
  /* nomes longos o bastante para o max-content das abas passar da largura
   * disponível — o caso em que o flex-wrap criava uma terceira linha */
  for (const id of ['fila-array', 'lista-encadeada', 'arvore-bst', 'lista-dupla', 'arvore-em-ordem']) {
    await trocarExemplo(page, id);
  }
  const m = await page.evaluate(() => {
    const head = document.querySelector('.code-head').getBoundingClientRect();
    const actions = document.querySelector('.code-actions').getBoundingClientRect();
    const tabs = document.getElementById('tabs').getBoundingClientRect();
    return {
      abas: document.querySelectorAll('#tabs .tab').length,
      scrollH: document.querySelector('.code-head').scrollHeight,
      clientH: document.querySelector('.code-head').clientHeight,
      acoesAbaixo: Math.round(actions.bottom - head.bottom),
      acoesAcima: Math.round(head.top - actions.top),
      abasVisiveis: tabs.width > 0 && tabs.height > 0
    };
  });
  expect(m.abas).toBeGreaterThan(1);
  expect(m.abasVisiveis).toBe(true);
  /* o cabeçalho não cresce nem deixa o cluster de ações descer sobre o código */
  expect(m.scrollH).toBeLessThanOrEqual(m.clientH);
  expect(m.acoesAbaixo).toBeLessThanOrEqual(0);
  expect(m.acoesAcima).toBeLessThanOrEqual(0);
});

test('layout empilha em janela estreita', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#splitLeft')).toBeHidden();
  await expect(page.locator('#codePanel')).toBeHidden();
  await expect(page.locator('#sidePanel')).toBeHidden();
  const modo = await page.evaluate(() => getComputedStyle(document.getElementById('layout')).display);
  expect(modo).toBe('block');
  const viz = await page.evaluate(() => document.getElementById('vizPanel').getBoundingClientRect().width);
  expect(viz).toBeGreaterThan(700);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  /* no desktop o Roteiro já nasce em coluna; não é preciso abrir Código */
  await expect(page.locator('#codePanel')).toBeVisible();
  await expect(page.locator('#splitLeft')).toBeVisible();
});

test('sem erros de página durante uma execução', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto('/visualizador.html');
  await executarPausado(page, 'arvore-bst-remocao');
  await page.click('#btnNext');
  await page.click('#btnNext');
  expect(erros).toEqual([]);
});

test('BST remoção: a duplicada aparece na fase com nós e no seletor (regressão)', async ({ page }) => {
  await page.goto('/visualizador.html');
  await executarPausado(page, 'arvore-bst-remocao');
  /* passa pelo fim (a seleção gruda na árvore principal vazia) e volta para a
   * fase da duplicada — o mesmo caminho do defeito relatado */
  await page.click('#btnLast');
  await page.evaluate(() => {
    const s = document.getElementById('slider');
    s.value = '799'; /* passo 800 de 873: a duplicada tem 3 nós */
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#canvasTitle')).toHaveText('Árvore binária');
  await expect(page.locator('#canvasSub')).toContainText('duplicada · 3 nós');
  await expect(page.locator('#structure .tree-node')).toHaveCount(3);

  /* o seletor lista a duplicada; escolhê-la mantém a exibição nela */
  await expect(page.locator('#structureSelect option', { hasText: 'Árvore binária — duplicada' })).toHaveCount(1);
  await page.selectOption('#structureSelect', { label: 'Árvore binária — duplicada' });
  await page.click('#btnNext');
  await expect(page.locator('#canvasSub')).toContainText('duplicada');

  /* a árvore principal continua selecionável à mão (vazia neste passo) */
  await page.selectOption('#structureSelect', { label: 'Árvore binária — arvore' });
  await expect(page.locator('#structure')).toContainText('A árvore está vazia neste passo.');
});

test('array puro: células por índice e edição destacada', async ({ page }) => {
  await page.goto('/visualizador.html');
  await page.evaluate(() => {
    document.getElementById('code').value = 'const v = [1, 2, 3];\nv[0] = 9;\nconsole.log(v);';
  });
  await page.click('#btnRun');
  const play = page.locator('#btnPlay');
  if ((await play.textContent()) === '❚❚') await play.click();
  /* Em um trace curto a reprodução pode chegar ao fim antes do clique; nesse
   * caso o controle de último passo já está desabilitado e o estado já é o
   * final que o teste quer validar. */
  const last = page.locator('#btnLast');
  if (await last.isEnabled()) await last.click();
  await expect(page.locator('#canvasTitle')).toHaveText('Array');
  await expect(page.locator('#structure .array-cell')).toHaveCount(3);
  await expect(page.locator('#structure .array-cell').first()).toContainText('9');
  await expect(page.locator('#structure')).toContainText('comprimento = 3');

  /* o seletor lista o array e o painel de comandos mostra a edição */
  await expect(page.locator('#structureSelect option', { hasText: 'Array — v' })).toHaveCount(1);
  await page.click('#btnDockToggle');
  await page.click('#tabCommands');
  await expect(page.locator('#commands')).toContainText('Edição');
});

test('trace longo executa e reporta memória (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'performance.memory só no Chromium');
  await page.goto('/visualizador.html');
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
  await page.goto('/visualizador.html');
  /* botões dentro de <select> são a marcação do select customizável (recurso
   * de navegadores compatíveis) — não são controles próprios */
  const semNome = await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .filter((b) => !b.closest('select'))
    .filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label'))).length);
  expect(semNome).toBe(0);
});

test('topbar: menu Mais agrupa Guia e Como usar e fecha com Esc', async ({ page }) => {
  await page.goto('/visualizador.html');
  await expect(page.locator('#btnTopMenu')).toBeVisible();
  await expect(page.locator('#linkGuia')).toBeHidden();
  await expect(page.locator('#btnHelp')).toBeHidden();

  await page.click('#btnTopMenu');
  await expect(page.locator('#linkGuia')).toBeVisible();
  await expect(page.locator('#btnHelp')).toBeVisible();
  await expect(page.locator('#linkGuia')).toHaveAttribute('href', 'guia/pilha.html');

  await page.keyboard.press('Escape');
  await expect(page.locator('#linkGuia')).toBeHidden();
  await expect(page.locator('#btnTopMenu')).toBeFocused();
});

test('ajuda: diálogo cabe na tela, abre no topo e rola até o fim', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await page.click('#btnTopMenu');
  await page.click('#btnHelp');

  const dialog = page.locator('#helpDialog');
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);

  const state = await page.evaluate(() => {
    const d = document.getElementById('helpDialog');
    return { scrollTop: d.scrollTop, active: document.activeElement.id, scrollable: d.scrollHeight > d.clientHeight };
  });
  expect(state.scrollTop).toBe(0);
  expect(state.active).toBe('helpTitle');
  expect(state.scrollable).toBe(true);

  await page.evaluate(() => {
    const d = document.getElementById('helpDialog');
    d.scrollTop = d.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Entendi' })).toBeInViewport();
});

test('comandos: BST e lista mostram as operações da estrutura (P2)', async ({ page }) => {
  await page.goto('/visualizador.html');
  await executarPausado(page, 'arvore-bst');
  await page.click('#btnLast');
  await page.click('#btnDockToggle');
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
  await page.goto('/visualizador.html');
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
  await page.goto('/visualizador.html');
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
  await abrirCodigo(page);
  const r = await page.evaluate(() => {
    const el = document.getElementById('statusLine');
    return { truncado: el.scrollWidth > el.clientWidth + 1, texto: el.textContent };
  });
  expect(r.texto).toContain('resultadoFinalDaOperacao');
  expect(r.truncado).toBe(false);
});

test('Roteiro em coluna: abre no desktop, recolhe e dá lugar à Prancha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#codePanel')).toBeVisible();

  const inicial = await page.evaluate(() => {
    const w = (id) => document.getElementById(id).getBoundingClientRect().width;
    return { code: w('codePanel'), viz: w('vizPanel'), side: w('sidePanel') };
  });
  expect(inicial.code).toBeGreaterThanOrEqual(420);
  expect(inicial.code).toBeLessThanOrEqual(620);
  expect(inicial.side).toBe(0);
  expect(inicial.viz).toBeGreaterThan(800);
  expect(await page.locator('#btnRun').count()).toBe(1);
  expect(await page.locator('#btnDebug').count()).toBe(1);
  expect(await page.evaluate(() => document.getElementById('btnRun').parentElement.id)).toBe('roteiroRunSlot');

  await page.click('#btnToggleCode');
  await expect(page.locator('#codePanel')).toBeHidden();
  await expect(page.locator('#btnToggleCode')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btnRun')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('btnRun').parentElement.id)).toBe('topbarRunSlot');
  await expect.poll(async () => {
    return page.evaluate(() => document.getElementById('vizPanel').getBoundingClientRect().width);
  }).toBeGreaterThan(1400);

  await page.click('#btnToggleCode');
  await expect(page.locator('#codePanel')).toBeVisible();
  await expect(page.locator('#btnToggleCode')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.getElementById('btnRun').parentElement.id)).toBe('roteiroRunSlot');
  await expect.poll(async () => {
    return page.evaluate(() => Math.round(document.getElementById('codePanel').getBoundingClientRect().width));
  }).toBeGreaterThanOrEqual(420);
  const comCodigo = await page.evaluate(() => {
    const w = (id) => document.getElementById(id).getBoundingClientRect().width;
    return { code: w('codePanel'), viz: w('vizPanel') };
  });
  expect(comCodigo.code).toBeLessThanOrEqual(620);
  expect(comCodigo.viz).toBeGreaterThan(comCodigo.code);

  await page.click('#btnToggleSide');
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect(page.locator('#btnToggleSide')).toHaveAttribute('aria-pressed', 'true');
  const ambos = await page.evaluate(() => {
    const w = (id) => document.getElementById(id).getBoundingClientRect().width;
    return { code: w('codePanel'), viz: w('vizPanel'), side: w('sidePanel') };
  });
  expect(ambos.viz).toBeGreaterThan(ambos.code);
  expect(ambos.viz).toBeGreaterThan(ambos.side);

  await page.keyboard.press('Escape');
  await expect(page.locator('#sidePanel')).toBeHidden();
  await page.click('#btnCollapseCode');
  await expect(page.locator('#codePanel')).toBeHidden();
  await expect(page.locator('#btnToggleCode')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => {
    return page.evaluate(() => document.getElementById('vizPanel').getBoundingClientRect().width);
  }).toBeGreaterThan(1400);
});

test('workspace persiste largura do Roteiro entre recargas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#codePanel')).toBeVisible();

  const antes = await page.evaluate(() => document.getElementById('codePanel').getBoundingClientRect().width);
  expect(antes).toBeGreaterThanOrEqual(420);
  expect(antes).toBeLessThanOrEqual(620);
  const split = await page.locator('#splitLeft').boundingBox();
  await page.mouse.move(split.x + 2, split.y + 200);
  await page.mouse.down();
  await page.mouse.move(split.x + 62, split.y + 200, { steps: 8 });
  await page.mouse.up();
  const depois = await page.evaluate(() => document.getElementById('codePanel').getBoundingClientRect().width);
  expect(depois).toBeGreaterThan(antes + 30);
  expect(depois).toBeLessThanOrEqual(901);

  await page.click('#btnToggleSide');
  await page.reload();
  await expect(page.locator('#codePanel')).toBeVisible();
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect(page.locator('#btnToggleSide')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('#sidePanel')).toBeHidden();
  /* O fechamento da margem dispara uma atualização de grade; em Chromium
   * sob carga, a leitura síncrona pode pegar o frame anterior. O poll espera
   * o mesmo estado final, sem afrouxar a tolerância de largura. */
  await expect.poll(async () => {
    const restaurado = await page.evaluate(() => document.getElementById('codePanel').getBoundingClientRect().width);
    return Math.abs(restaurado - depois);
  }).toBeLessThan(12);
});

test('Ampliar o editor dá espaço ao código e restaura a largura anterior', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#codePanel')).toBeVisible();

  const largura = () => page.evaluate(() => Math.round(document.getElementById('codePanel').getBoundingClientRect().width));
  const antes = await largura();
  expect(antes).toBeGreaterThanOrEqual(420);
  expect(antes).toBeLessThanOrEqual(620);

  await page.click('#btnExpandCode');
  await expect(page.locator('#btnExpandCode')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(largura).toBeGreaterThan(antes + 200);
  const ampliado = await largura();
  expect(ampliado).toBeLessThanOrEqual(901);
  expect(await page.evaluate(() => Math.round(document.getElementById('vizPanel').getBoundingClientRect().width)))
    .toBeGreaterThanOrEqual(480);

  /* a preferência sobrevive à recarga */
  await page.reload();
  await expect(page.locator('#btnExpandCode')).toHaveAttribute('aria-pressed', 'true');
  expect(await largura()).toBe(ampliado);

  await page.click('#btnExpandCode');
  await expect(page.locator('#btnExpandCode')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(largura).toBe(antes);
});

test('abas e divisória não avançam a execução', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/visualizador.html');
  await executarPausado(page, 'arvore-bst');
  await page.evaluate(() => {
    const s = document.getElementById('slider');
    s.value = '99';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const passo = await page.locator('#stepLabel').textContent();
  expect(passo).toContain('100 / ');

  await page.click('#btnToggleSide');
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect(page.locator('#inspTabVars')).toBeVisible();
  await page.locator('#inspTabVars').focus();
  await expect(page.locator('#inspTabVars')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#stepLabel')).toHaveText(passo);

  /* o Roteiro já está em coluna no desktop; a aba ativa recebe o foco */
  await page.locator('#tabs .tab.active .tab-name').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#stepLabel')).toHaveText(passo);

  await page.click('#btnDockToggle');
  await page.locator('#tabCommands').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#stepLabel')).toHaveText(passo);

  await page.locator('#splitLeft').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#stepLabel')).toHaveText(passo);
});

test('dock: histórico expande, alterna eventos e persiste', async ({ page }) => {
  await page.goto('/visualizador.html');
  await executarPausado(page, 'pilha-array');
  await page.click('#btnNext');
  await page.click('#btnNext');
  await page.click('#btnDockToggle');
  await expect(page.locator('#dockHistory')).toBeVisible();
  await page.click('#tabEvents');
  await expect(page.locator('#pageEvents')).toHaveClass(/active/);
  await expect(page.locator('#events')).toContainText('#');

  await page.reload();
  await expect(page.locator('#dockHistory')).toBeVisible();
  await expect(page.locator('#tabEvents')).toHaveClass(/active/);
});

test('redimensionar os painéis preserva passo e zoom manual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await executarPausado(page, 'lista-encadeada');
  await page.click('#btnLast');
  await abrirCodigo(page);
  const passo = await page.locator('#stepLabel').textContent();
  await page.click('#btnZoomIn');
  const zoom = await page.locator('#btnZoomReset').textContent();

  const split = await page.locator('#splitLeft').boundingBox();
  await page.mouse.move(split.x + 2, split.y + 200);
  await page.mouse.down();
  await page.mouse.move(split.x + 70, split.y + 200, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator('#stepLabel')).toHaveText(passo);
  await expect(page.locator('#btnZoomReset')).toHaveText(zoom);
  await expect(page.locator('#structure .list-node').first()).toBeVisible();
});

test('grade do canvas alterna e persiste', async ({ page }) => {
  await page.goto('/visualizador.html');
  await page.click('#btnGrid');
  await expect(page.locator('#btnGrid')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#btnGrid')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#structure')).toHaveClass(/no-grid/);
});

test('play fica indisponível quando a execução falhou', async ({ page }) => {
  await page.goto('/visualizador.html');
  await abrirCodigo(page);
  await page.fill('#code', 'naoExiste();');
  await page.click('#btnRun');
  await expect(page.locator('#vizRunStateText')).toHaveText('falhou');
  await expect(page.locator('#btnPlay')).toBeDisabled();
  await expect(page.locator('#btnPlay')).toHaveAttribute('title', /falhou/i);
  /* o palco não manda executar de novo: o próximo passo é corrigir a linha */
  await expect(page.locator('#structure')).toContainText('Corrija o erro e execute de novo.');
  /* o texto do banner precisa passar AA sobre o fundo composto */
  const contraste = await page.evaluate(() => {
    function parse(s) {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((v) => parseFloat(v.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) {
      const v = [c.r, c.g, c.b].map((x) => {
        x /= 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    function blend(fg, bg) {
      return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    }
    const el = document.getElementById('banner');
    const fg = parse(getComputedStyle(el).color);
    const bg = blend(parse(getComputedStyle(el).backgroundColor), parse(getComputedStyle(document.body).backgroundColor));
    const l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
  expect(contraste).toBeGreaterThanOrEqual(4.5);
  /* mesmo um clique programático não reabre a reprodução do trace falho */
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await expect(page.locator('#vizRunStateText')).toHaveText('falhou');
  expect(await page.locator('#btnPlay').evaluate((el) => el.classList.contains('playing'))).toBe(false);
});

test('Roteiro abre na largura da coluna e sinaliza a cauda da linha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await trocarExemplo(page, 'lista-dupla');
  await abrirCodigo(page);
  const largura = await page.locator('#codePanel').evaluate((el) => el.getBoundingClientRect().width);
  expect(largura).toBeGreaterThanOrEqual(420);
  expect(largura).toBeLessThanOrEqual(621);
  await expect(page.locator('#codeViewport')).toHaveClass(/is-overflowing/);
  await expect(page.locator('#statusOverflow')).toBeVisible();
  await expect(page.locator('#statusOverflow')).toContainText('ver o resto');
  const hlX = () => page.locator('.code-highlight').evaluate((el) => Math.round(el.getBoundingClientRect().x));
  const antes = await hlX();
  await page.click('#statusOverflow');
  await expect.poll(hlX).toBeLessThan(antes - 10);
  await expect(page.locator('#statusOverflow')).toHaveText('← início');
  await page.click('#statusOverflow');
  await expect.poll(hlX).toBe(antes);
  await expect(page.locator('#statusOverflow')).toContainText('ver o resto');
});

test('histórico dimensiona pelo conteúdo e não cobre metade do palco', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#codePanel')).toBeVisible();
  const larguraCode = await page.evaluate(() => Math.round(document.getElementById('codePanel').getBoundingClientRect().width));
  expect(larguraCode).toBeGreaterThanOrEqual(340);
  expect(larguraCode).toBeLessThanOrEqual(400);
  await expect(page.locator('#splitLeft')).toBeVisible();
  await page.click('#btnDockToggle');
  await expect(page.locator('#dockHistory')).toBeVisible();
  const medidas = await page.evaluate(() => {
    const dock = document.getElementById('dockHistory').getBoundingClientRect();
    const canvas = document.querySelector('.canvas-viewport').getBoundingClientRect();
    return { dock: dock.height, top: dock.top, canvas: canvas.height };
  });
  expect(medidas.dock).toBeLessThan(245);
  expect(medidas.dock / medidas.canvas).toBeLessThan(0.42);
  /* a câmera reenquadra acima do dock: a base da pilha não fica escondida */
  const base = await page.locator('.stack-side').boundingBox();
  expect(base).not.toBeNull();
  expect(base.y + base.height).toBeLessThanOrEqual(medidas.top + 1);
});

test('lista dupla mantém PREV/NEXT legíveis no recorte de 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/visualizador.html');
  await trocarExemplo(page, 'lista-dupla');
  /* vai ao passo com o maior número de nós já ligados (a lista cheia) */
  const cheio = await page.evaluate(() => {
    const s = document.getElementById('slider');
    let best = { i: 0, nos: 0 };
    for (let i = 0; i <= Number(s.max); i++) {
      s.value = i;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      const nos = document.querySelectorAll('.list-node:not(.pending)').length;
      if (nos > best.nos) best = { i, nos };
    }
    s.value = best.i;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return best;
  });
  expect(cheio.nos).toBeGreaterThanOrEqual(5);
  /* sem o piso a câmera encolhia a lista para ~84% e os rótulos para ~9px */
  await expect(page.locator('#btnZoomReset')).toHaveText('100%');
  const dentro = await page.evaluate(() => {
    const vp = document.querySelector('.canvas-viewport').getBoundingClientRect();
    const alvo = document.querySelector('.list-node.pending, .list-node.target, .list-node.active, .list-node.new');
    if (!alvo) return false;
    const r = alvo.getBoundingClientRect();
    return r.left >= vp.left - 1 && r.right <= vp.right + 1;
  });
  expect(dentro).toBe(true);
  /* o próximo passo pode trocar o nó em foco sem mudar o tamanho da lista */
  await page.click('#btnNext');
  const aindaDentro = await page.evaluate(() => {
    const vp = document.querySelector('.canvas-viewport').getBoundingClientRect();
    const alvo = document.querySelector('.list-node.pending, .list-node.target, .list-node.active, .list-node.new');
    if (!alvo) return true;
    const r = alvo.getBoundingClientRect();
    return r.left >= vp.left - 1 && r.right <= vp.right + 1;
  });
  expect(aindaDentro).toBe(true);
});

test('mobile: gavetas não empilham e o chrome do palco não fica no sliver', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/visualizador.html');
  /* abaixo de 420 a topbar entrega o espaço aos controles principais; a
   * aba lateral CÓDIGO continua sendo a entrada da gaveta */
  await page.click('#railCode');
  await expect(page.locator('#codePanel')).toBeVisible();
  /* a folha cobre o palco: os controles de câmera não ficam clicáveis na borda */
  await expect(page.locator('.viz-tools')).toBeHidden();
  const largura = await page.locator('#codePanel').evaluate((el) => el.getBoundingClientRect().width);
  expect(largura).toBeGreaterThanOrEqual(380);
  /* abrir o histórico fecha a folha de código em vez de empilhar as duas */
  await page.click('#btnDockToggle');
  await expect(page.locator('#dockHistory')).toBeVisible();
  await expect(page.locator('#codePanel')).toBeHidden();
});

test('390: as folhas cobrem a largura e terminam no topo da Régua', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/visualizador.html');
  const limites = (id) => page.evaluate((id) => {
    const folha = document.getElementById(id).getBoundingClientRect();
    const regua = document.getElementById('dock').getBoundingClientRect();
    return {
      largura: Math.round(folha.width),
      base: Math.round(folha.bottom),
      topoRegua: Math.round(regua.top)
    };
  }, id);

  await page.click('#railCode');
  await expect(page.locator('#codePanel')).toBeVisible();
  const codigo = await limites('codePanel');
  expect(codigo.largura).toBeGreaterThanOrEqual(380);
  expect(codigo.base).toBeLessThanOrEqual(codigo.topoRegua + 1);

  await page.click('#btnCollapseCode');
  await expect(page.locator('#codePanel')).toBeHidden();
  await page.click('#railInspector');
  await expect(page.locator('#sidePanel')).toBeVisible();
  const margem = await limites('sidePanel');
  expect(margem.largura).toBeGreaterThanOrEqual(380);
  expect(margem.base).toBeLessThanOrEqual(margem.topoRegua + 1);
});

test('390: folhas recolhidas não criam rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/visualizador.html');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await expect.poll(overflow).toBe(0);

  await page.click('#railInspector');
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect.poll(overflow).toBe(0);

  await page.click('#btnCollapseSide');
  await expect.poll(overflow).toBe(0);
});

test('Roteiro: o atalho do rodapé reaparece quando o painel tem espaço', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await page.click('#code');
  await page.keyboard.type('x');
  await expect(page.locator('#statusHint')).toBeVisible();
});

test('Margem aberta: o Roteiro recua e o overflow do código aparece na hora', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visualizador.html');
  await expect(page.locator('#codePanel')).toBeVisible();
  const larguraCode = () => page.locator('#codePanel').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(await larguraCode()).toBeGreaterThan(430);

  await page.click('#btnToggleSide');
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect.poll(larguraCode).toBe(430);
  const larguraViz = await page.locator('#vizPanel').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(larguraViz).toBeGreaterThan(430);
  await expect(page.locator('#statusOverflow')).toBeVisible();
  await expect(page.locator('#statusOverflow')).toContainText('ver o resto');

  await page.click('#btnToggleSide');
  await expect.poll(larguraCode).toBeGreaterThan(430);
  await expect(page.locator('#statusOverflow')).toBeHidden();
});

test('1024: abrir a Margem fecha o Roteiro e a árvore cabe na área visível', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/visualizador.html');
  await trocarExemplo(page, 'arvore-bst');
  await expect(page.locator('#codePanel')).toBeVisible();

  await page.click('#btnToggleSide');
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect(page.locator('#codePanel')).toBeHidden();

  /* a câmera desconta a folha da Margem: nenhum nó fica sob o painel e o
   * desenho fica centrado na área que sobrou, não na viewport inteira */
  const enquadramento = () => page.evaluate(() => {
    const vp = document.querySelector('.canvas-viewport').getBoundingClientRect();
    const side = document.getElementById('sidePanel').getBoundingClientRect();
    const right = Math.min(vp.right, side.left);
    const nos = Array.from(document.querySelectorAll('#structure .tree-node'));
    if (!nos.length) return false;
    let left = Infinity, far = -Infinity;
    const dentro = nos.every((n) => {
      const r = n.getBoundingClientRect();
      left = Math.min(left, r.left);
      far = Math.max(far, r.right);
      return r.left >= vp.left - 2 && r.right <= right + 2 &&
        r.top >= vp.top - 2 && r.bottom <= vp.bottom + 2;
    });
    const centro = (vp.left + right) / 2;
    return dentro && Math.abs((left + far) / 2 - centro) <= 24;
  });
  await expect.poll(enquadramento, { intervals: [100, 200, 500] }).toBe(true);
});

test('ajuda: Esc fecha o diálogo sem fechar a Margem atrás dele', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/visualizador.html');
  await page.click('#btnToggleSide');
  await expect(page.locator('#sidePanel')).toBeVisible();

  await page.click('#btnTopMenu');
  await page.click('#btnHelp');
  await expect(page.locator('#helpDialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#helpDialog')).toBeHidden();
  await expect(page.locator('#sidePanel')).toBeVisible();
  await expect(page.locator('#btnToggleSide')).toHaveAttribute('aria-pressed', 'true');
  /* o gatilho fica no menu fechado; o foco volta ao controle visível */
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btnTopMenu');
});

test('exemplo de árvore no primeiro passo aguarda a raiz em vez de recomendar outra estrutura', async ({ page }) => {
  await page.goto('/visualizador.html');
  await executarPausado(page, 'arvore-bst');
  await expect(page.locator('#structure')).toContainText('aparece quando o código criar a raiz');
  await expect(page.locator('#structure')).not.toContainText('Nenhuma estrutura detectada');
  await expect(page.locator('#structure')).not.toContainText('Use uma pilha ou fila');
});

test('390: inserção na lista dupla mostra o nó pendente e parte da lista existente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/visualizador.html');
  await trocarExemplo(page, 'lista-dupla');

  const encontrado = await page.evaluate(() => {
    const s = document.getElementById('slider');
    for (let i = 0; i <= Number(s.max); i++) {
      s.value = i;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      const pendente = document.querySelector('.list-node.pending');
      if (pendente && document.querySelectorAll('.list-node:not(.pending)').length > 0) return true;
    }
    return false;
  });
  expect(encontrado).toBe(true);

  await expect.poll(async () => page.evaluate(() => {
    const vp = document.querySelector('.canvas-viewport').getBoundingClientRect();
    const pendente = document.querySelector('.list-node.pending');
    if (!pendente) return false;
    const r = pendente.getBoundingClientRect();
    const dentro = r.left >= vp.left - 2 && r.right <= vp.right + 2;
    /* a lista existente não pode sumir inteira para a esquerda: pelo menos
     * um nó real precisa encostar na área visível */
    const reais = Array.from(document.querySelectorAll('.list-node:not(.pending)'));
    const vizinho = reais.some((n) => {
      const q = n.getBoundingClientRect();
      return q.right >= vp.left + 1 && q.left <= vp.right - 1;
    });
    return dentro && vizinho;
  }), { intervals: [100, 200, 500] }).toBe(true);
});

test('rótulos funcionais respeitam o piso de 11px', async ({ page }) => {
  await page.goto('/visualizador.html');
  const medir = () => page.evaluate(() => {
    const sels = ['.stage-rail span', '.stack-side', '.viz-state', '.step-op', '.status-hint', '.dock-sub', '.insp-count',
      '.cell-idx', '.cell-flag', '.queue-ptr', '.queue-idx', '.list-head-tag', '.list-next', '.list-prev', '.ptr-chip',
      '.array-idx', '.array-size-tag'];
    const out = [];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) out.push([s, parseFloat(getComputedStyle(el).fontSize)]);
    }
    return out;
  });
  const conferir = (itens) => {
    for (const [seletor, tamanho] of itens) expect(tamanho, seletor).toBeGreaterThanOrEqual(11);
  };
  conferir(await medir());
  for (const id of ['fila-array', 'lista-dupla', 'meu-array']) {
    await trocarExemplo(page, id);
    conferir(await medir());
  }
});

test('Margem: dica de primeiro uso aparece uma vez e é lembrada', async ({ page }) => {
  await page.goto('/visualizador.html');
  await page.evaluate(() => localStorage.removeItem('edviz.sideHintSeen'));
  await page.reload();
  await expect(page.locator('#sideHint')).toBeHidden();

  await page.click('#btnToggleSide');
  await expect(page.locator('#sideHint')).toBeVisible();
  await expect(page.locator('#sideHint')).toContainText('variáveis');
  await page.click('#btnSideHintClose');
  await expect(page.locator('#sideHint')).toBeHidden();

  await page.click('#btnCollapseSide');
  await page.click('#btnToggleSide');
  await expect(page.locator('#sideHint')).toBeHidden();

  await page.reload();
  await expect(page.locator('#sideHint')).toBeHidden();
});
