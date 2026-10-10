/* ED Viz — acessibilidade automatizada com axe-core (WCAG 2.0/2.1 A+AA).
 * Violações críticas/sérias falham o teste; as demais ficam registradas.
 */
// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function analisar(page, rotulo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    /* os <button> dentro de <select> são a marcação do select customizável;
     * em navegadores sem suporte eles não são controles reais (falso-positivo) */
    .exclude('select > button')
    .analyze();
  const resumo = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  if (resumo.length) console.log('  [axe ' + rotulo + '] ' + JSON.stringify(resumo));
  return results;
}

/* regras de best-practice que o projeto decidiu corrigir: não entram no
 * filtro WCAG acima, mas não podem voltar a aparecer */
async function regrasBestPractice(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['best-practice'])
    .exclude('select > button')
    .analyze();
  return results.violations
    .filter((v) => v.id === 'label-title-only' || v.id === 'page-has-heading-one')
    .map((v) => v.id + ':' + v.nodes.length);
}

async function conferirEstruturaA11y(page) {
  /* o cabeçalho do app é o h1 da página */
  await expect(page.locator('h1.brand-name')).toHaveCount(1);
  await expect(page.locator('h1.brand-name')).toHaveText('ED Viz');
  /* os seletores têm nome acessível próprio (before: só title) */
  await expect(page.locator('#structureSelect')).toHaveAccessibleName('Estrutura exibida');
  await expect(page.locator('#exampleSelect')).toHaveAccessibleName('Abrir exemplo');
  await expect(page.locator('#speedSelect')).toHaveAccessibleName('Velocidade de reprodução');
}

test('acessibilidade: página inicial sem violações críticas/sérias', async ({ page }) => {
  await page.goto('/');
  const results = await analisar(page, 'inicial');
  const graves = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(graves.map((v) => v.id)).toEqual([]);
  expect(await regrasBestPractice(page)).toEqual([]);
  await conferirEstruturaA11y(page);
});

test('acessibilidade: depois de executar um exemplo', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '❚❚') await page.click('#btnPlay');
  await page.click('#btnNext');
  const results = await analisar(page, 'execução');
  const graves = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(graves.map((v) => v.id)).toEqual([]);
  expect(await regrasBestPractice(page)).toEqual([]);
  await conferirEstruturaA11y(page);
});
