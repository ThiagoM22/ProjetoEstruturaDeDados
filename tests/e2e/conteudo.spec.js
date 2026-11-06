/* ED Viz — navegação da home e do guia, deep link e acessibilidade.
 *
 * Cobre o que a home e o guia acrescentam ao produto: as duas portas de
 * entrada, o link contextual da ferramenta, o contrato `?exemplo=&passo=`
 * e o build de produção servido pelo Vite.
 */
// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterEach(async ({ page }) => {
  /* Firefox: feche a página antes do contexto. Sem isso, o teardown pode
   * falhar em Browser.removeBrowserContext ao restaurar abas. */
  await page.close().catch(() => {});
});

test('home apresenta as cinco estruturas e leva ao guia', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ED Viz/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Entenda a estrutura');
  await expect(page.locator('.rows a.row')).toHaveCount(5);

  await page.click('.hero a[href="guia/index.html"]');
  await expect(page).toHaveURL(/\/guia\/index\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Estruturas de dados');
  await expect(page.locator('.rows a.row')).toHaveCount(5);
});

test('guia abre a estrutura e o exemplo no visualizador', async ({ page }) => {
  await page.goto('/guia/index.html');
  await page.click('a.row[href="pilha.html"]');
  await expect(page).toHaveURL(/\/guia\/pilha\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pilha');

  const demo = page.locator('a.demo[href="../visualizador.html?exemplo=pilha-array&passo=5"]');
  await expect(demo).toHaveCount(1);
  await demo.click();
  await expect(page).toHaveURL(/\/visualizador\.html\?exemplo=pilha-array&passo=5$/);
  await expect(page.locator('#exampleSelect')).toHaveValue('pilha-array');
  await expect(page.locator('#stepLabel')).toHaveText(/^passo 5\/\d+$/);
});

test('link direto abre o exemplo no passo e pausado', async ({ page }) => {
  await page.goto('/visualizador.html?exemplo=pilha-array&passo=4');
  await expect(page.locator('#exampleSelect')).toHaveValue('pilha-array');
  await expect(page.locator('#stepLabel')).toHaveText(/^passo 4\/\d+$/);
  await expect(page.locator('#btnPlay')).toHaveText('▶');
});

test('passo fora do intervalo é limitado ao último passo', async ({ page }) => {
  await page.goto('/visualizador.html?exemplo=pilha-array&passo=9999');
  const label = (await page.locator('#stepLabel').textContent()) || '';
  const m = label.match(/passo (\d+)\/(\d+)/);
  expect(m).not.toBeNull();
  expect(m[1]).toBe(m[2]);
});

test('exemplo inexistente não quebra: volta ao padrão', async ({ page }) => {
  await page.goto('/visualizador.html?exemplo=nao-existe');
  await expect(page.locator('#exampleSelect')).toHaveValue('pilha-array');
  await expect(page.locator('#banner')).toHaveClass(/hidden/);
  await expect(page.locator('#stepLabel')).toHaveText(/passo 1\/\d+/);
});

test('link com passo usa o código original e preserva o buffer do usuário', async ({ page }) => {
  const editado = 'const pilha = [];\npilha.push(1);\npilha.push(2);\nconsole.log(pilha.pop());';

  await page.goto('/visualizador.html');
  await page.locator('#code').fill(editado);
  await expect(page.locator('#code')).toHaveValue(editado);

  await page.goto('/visualizador.html?exemplo=pilha-array&passo=4');
  await expect(page.locator('#stepLabel')).toHaveText(/^passo 4\/\d+$/);
  const codigoDoLink = await page.locator('#code').inputValue();
  expect(codigoDoLink).toContain('// PILHA (stack)');
  expect(codigoDoLink).not.toBe(editado);

  await page.goto('/visualizador.html');
  await expect(page.locator('#code')).toHaveValue(editado);
});

test('o link Guia acompanha a estrutura do exemplo ativo', async ({ page }) => {
  await page.goto('/visualizador.html?exemplo=arvore-bst');
  const guia = page.locator('#linkGuia');
  await expect(guia).toHaveAttribute('href', 'guia/arvore-binaria.html');
  await expect(guia).toHaveAttribute('aria-label', 'Guia: Árvore binária');
});

test('360px: home e guia não têm rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });

  for (const url of ['/', '/guia/index.html', '/guia/array.html', '/guia/pilha.html', '/guia/fila.html', '/guia/lista-encadeada.html', '/guia/arvore-binaria.html']) {
    await page.goto(url);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura, url).toBeLessThanOrEqual(361);
  }
});

test('miniatura animada pausa e retoma', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('#miniDemo').scrollIntoViewIfNeeded();

  const toggle = page.locator('#miniToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('Pausar');

  await toggle.click();
  await expect(toggle).toHaveText('Retomar');
  await expect(toggle).toHaveAttribute('aria-label', 'Retomar animação');

  await toggle.click();
  await expect(toggle).toHaveText('Pausar');
});

test('miniatura estática com movimento reduzido', async ({ page }) => {
  await page.goto('/');
  await page.locator('#miniDemo').scrollIntoViewIfNeeded();

  await expect(page.locator('#miniToggle')).toBeHidden();
  await expect(page.locator('.mini-cell.is-on')).toHaveCount(3);
  await expect(page.locator('#miniText')).toHaveText('Topo = 30: o 30 foi o último a entrar.');
});

test('home e guia sem violações críticas/sérias no axe', async ({ page }) => {
  for (const url of ['/', '/guia/index.html', '/guia/array.html', '/guia/pilha.html', '/guia/fila.html', '/guia/lista-encadeada.html', '/guia/arvore-binaria.html']) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const graves = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(graves.map((v) => v.id), url).toEqual([]);
  }
});

test('build de produção não injeta script inline (CSP)', async ({ request }) => {
  for (const url of ['/', '/visualizador.html', '/guia/index.html', '/guia/array.html', '/guia/pilha.html', '/guia/fila.html', '/guia/lista-encadeada.html', '/guia/arvore-binaria.html']) {
    const res = await request.get(url);
    const html = await res.text();
    expect(html, url).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  }
});
