/* ED Viz — estresse de animação com animações LIGADAS.
 * O restante da suíte roda com reduced motion; aqui o objetivo é reproduzir
 * stepping rápido/tecla segurada e conferir que nada fica preso (EU-07).
 */
// @ts-check
const { test, expect } = require('@playwright/test');

async function preparar(page, exemplo) {
  await page.goto('/');
  await page.evaluate((id) => {
    const sel = document.getElementById('exampleSelect');
    sel.value = id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, exemplo);
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '❚❚') await page.click('#btnPlay');
  const first = page.locator('#btnFirst');
  if (await first.isEnabled()) await first.click();
}

function clonesPresos(page) {
  return page.evaluate(() => Array.from(document.body.children)
    .filter((el) => el.style && el.style.position === 'fixed').length);
}

test('stepping rápido não deixa clones de animação presos', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await preparar(page, 'lista-simples');
  for (let i = 0; i < 40; i++) {
    const b = page.locator('#btnNext');
    if (await b.isEnabled()) await b.click();
  }
  await page.waitForTimeout(900);
  expect(await clonesPresos(page)).toBe(0);
  await expect(page.locator('#structure')).not.toBeEmpty();
  expect(erros).toEqual([]);
});

test('segurar a seta não quebra a animação', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await preparar(page, 'fila-array');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(900);
  expect(await clonesPresos(page)).toBe(0);
  await expect(page.locator('#stepLabel')).toHaveText(/passo \d+\/\d+/);
  expect(erros).toEqual([]);
});
