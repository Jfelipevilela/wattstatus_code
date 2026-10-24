const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateNarration, extractQuantities } = require('../dist/modules/ai/ai.guard');

const draft = 'Com base na potência e nas horas de uso cadastradas de Ar-condicionado e na tarifa de R$ 0,82/kWh, passar de 8 h para 6 h por dia economiza cerca de 84 kWh e R$ 68,88 por mês (25% do consumo dele), ou R$ 826,56 em um ano.';
const facts = {
  draft,
  values: { savings: { monthlyKWh: 84, monthlyCost: 68.88, annualCost: 826.56, percent: 0.25 }, rate: 0.82, applianceName: 'Ar-condicionado' },
  allowedNames: [],
  forbiddenNames: ['Ar-condicionado', 'TV', 'Geladeira', 'Computador', 'Casa da praia', 'Quarto'],
  measured: false,
};
const check = (text) => validateNarration(text, facts);

test('faithful rewrite passes', () => {
  assert.deepEqual(check('Reduzindo o ar-condicionado de 8 h para 6 h por dia, a economia estimada é de cerca de 84 kWh, ou R$ 68,88 por mês (25% do consumo dele) e R$ 826,56 em um ano, pela tarifa de R$ 0,82/kWh.'), []);
});

test('quantities in words are parsed', () => {
  const values = extractQuantities('duzentos e cinquenta reais e mil e duzentos kWh, quinze por cento').map((q) => [q.value, q.unit]);
  assert.deepEqual(values, [[250, 'R$'], [1200, 'kWh'], [15, '%']]);
});

test('invented numbers are refused: digits, words, percent, rounding', () => {
  assert.ok(check('A economia é de R$ 70,00 por mês.').includes('number'));
  assert.ok(check('Você economiza noventa reais por mês.').includes('number'));
  assert.ok(check('Isso representa 30% do consumo dele.').includes('number'));
  // Honest rounding of a computed value is fine; a different value is not.
  assert.deepEqual(check('Economia de cerca de R$ 69 por mês.'), []);
  assert.ok(check('Economia de R$ 68,80 por mês.').includes('number'));
  assert.ok(check('Cerca de 85 kWh por mês.').includes('number'));
});

test('a known value with another unit is refused', () => {
  assert.ok(check('Você economiza 84 reais por mês.').includes('unit'));
  assert.ok(check('São R$ 25 a menos.').includes('unit'));
});

test('tariff cannot change', () => {
  assert.ok(check('Na tarifa de R$ 0,95/kWh a economia é R$ 68,88.').includes('number'));
});

test('another appliance or property is refused', () => {
  assert.ok(check('Reduzir a TV de 8 h para 6 h economiza R$ 68,88 por mês.').includes('name'));
  assert.ok(check('Na Casa da praia, a economia seria R$ 68,88.').includes('name'));
});

test('estimated values cannot be called measured', () => {
  assert.ok(check('O consumo medido do ar é 84 kWh por mês.').includes('source'));
  assert.deepEqual(check('O aparelho não tem medição real; são 84 kWh estimados.').filter((v) => v === 'source'), []);
});

test('causal claims and guarantees are refused', () => {
  assert.ok(check('Sua conta subiu porque o ar fica ligado 8 h.').includes('causal'));
  assert.ok(check('O aumento foi causado pelo ar-condicionado.').includes('causal'));
  assert.ok(check('Você vai economizar R$ 68,88 com certeza.').includes('guarantee'));
  assert.ok(check('Economia garantida de R$ 68,88.').includes('guarantee'));
});

test('new periods are refused', () => {
  assert.ok(check('Em setembro, a economia seria R$ 68,88.').includes('period'));
  assert.ok(check('Comparado ao ano passado, você economiza R$ 68,88.').includes('period'));
});

test('cutting an essential appliance is refused', () => {
  assert.ok(check('Desligue a geladeira à noite e economize R$ 68,88.').includes('essential'));
});

test('a rewrite must keep "not enough data"', () => {
  const f = { ...facts, draft: 'Não há dados suficientes para prever a conta deste mês.', values: {} };
  assert.ok(validateNarration('A conta deve ficar estável neste mês.', f).includes('insufficient'));
  assert.deepEqual(validateNarration('Não tenho informações suficientes para determinar isso ainda.', f), []);
});
