import type { Model } from './types';
import { SCHEMA_VERSION } from './types';

/** Canonical Task 13 LP model (assignment.md). */
export function createTask13Model(): Model {
  return {
    schema_version: SCHEMA_VERSION,
    resources: ['Труд', 'Сырье', 'Оборудование'],
    products: ['Осциллограф', 'Частотомер', 'Генератор', 'Вольтметр'],
    A: [
      [7, 2, 2, 6],
      [5, 8, 4, 3],
      [2, 4, 1, 8],
    ],
    b: [80, 480, 130],
    c: [3, 4, 3, 1],
    resource_units: ['чел./дней', 'кг', 'станков/ч'],
    product_units: ['шт', 'шт', 'шт', 'шт'],
    objective_unit: 'у.е.',
    what_if_defaults: {
      resource_pct: 0.1,
      modernization_pct: 0.1,
      price_pct: 0.15,
    },
  };
}

export function createBlankModel(nResources = 2, nProducts = 2): Model {
  const resources = Array.from({ length: nResources }, (_, i) => `Ресурс ${i + 1}`);
  const products = Array.from({ length: nProducts }, (_, i) => `Продукт ${i + 1}`);
  return {
    schema_version: SCHEMA_VERSION,
    resources,
    products,
    A: resources.map(() => products.map(() => 1)),
    b: resources.map(() => 10),
    c: products.map(() => 1),
    what_if_defaults: {
      resource_pct: 0.1,
      modernization_pct: 0.1,
      price_pct: 0.15,
    },
  };
}
