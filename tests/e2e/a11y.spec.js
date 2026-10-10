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

test('acessibilidade: página inicial sem violações críticas/sérias', async ({ page }) => {
  await page.goto('/');
  const results = await analisar(page, 'inicial');
  const graves = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(graves.map((v) => v.id)).toEqual([]);
});

test('acessibilidade: depois de executar um exemplo', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnRun');
  if ((await page.locator('#btnPlay').textContent()) === '❚❚') await page.click('#btnPlay');
  await page.click('#btnNext');
  const results = await analisar(page, 'execução');
  const graves = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(graves.map((v) => v.id)).toEqual([]);
});
