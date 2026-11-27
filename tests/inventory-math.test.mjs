import assert from 'node:assert/strict';
import test from 'node:test';
import '../inventory-math.js';

const { calculateInventory, summarizeInventory } = globalThis.InventoryMath;

test('inventory reconciles opening stock, purchases, sales, and returned goods', () => {
  const rows = calculateInventory(
    [{ id: 'A', opening: 10, reorder: 8, buy: 100 }],
    [{ product_id: 'A', qty: 5 }, { product_id: 'A', qty: 2 }],
    [{ product_id: 'A', qty: 10 }],
    [{ product_id: 'A', qty: 1 }]
  );
  assert.equal(rows[0].current, 8);
  assert.equal(rows[0].status, 'reorder');
  assert.equal(rows[0].orderGap, 0);
  assert.equal(rows[0].value, 800);
});

test('zero and negative balances are critical and never create negative asset value', () => {
  const rows = calculateInventory(
    [{ id: 'zero', opening: 0, reorder: 3, buy: 90 }, { id: 'negative', opening: 2, reorder: 0, buy: 50 }],
    [],
    [{ product_id: 'negative', qty: 4 }],
    []
  );
  assert.deepEqual(rows.map(row => [row.current, row.status, row.value]), [[0, 'critical', 0], [-2, 'critical', 0]]);
});

test('summary counts each status and values only positive inventory', () => {
  const rows = calculateInventory(
    [
      { id: 'A', opening: 8, reorder: 8, buy: 100 },
      { id: 'B', opening: 0, reorder: 2, buy: 80 },
      { id: 'C', opening: 6, reorder: 2, buy: 100 },
      { id: 'D', opening: 2, reorder: 2, buy: 50 }
    ],
    [],
    [{ product_id: 'C', qty: 8 }],
    [{ product_id: 'D', qty: 1 }, { product_id: 'missing', qty: 100 }]
  );
  assert.deepEqual(summarizeInventory(rows), {
    productCount: 4,
    criticalCount: 2,
    reorderCount: 1,
    sufficientCount: 1,
    stockValue: 950
  });
});
