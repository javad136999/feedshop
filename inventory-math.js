(function (root) {
  const numeric = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function calculateInventory(products = [], purchases = [], sales = [], returns = []) {
    const inventory = new Map((products || []).map(item => [String(item.id), {
      product: item,
      opening: numeric(item.opening),
      purchased: 0,
      sold: 0,
      returned: 0
    }]));

    const addMovements = (movements, field) => {
      (movements || []).forEach(movement => {
        const record = inventory.get(String(movement.product_id));
        if (record) record[field] += numeric(movement.qty);
      });
    };

    addMovements(purchases, 'purchased');
    addMovements(sales, 'sold');
    addMovements(returns, 'returned');

    return [...inventory.values()].map(record => {
      const reorder = numeric(record.product.reorder);
      const current = record.opening + record.purchased + record.returned - record.sold;
      return {
        ...record,
        current,
        reorder,
        orderGap: Math.max(0, reorder - current),
        status: current <= 0 ? 'critical' : current <= reorder ? 'reorder' : 'sufficient',
        value: Math.max(0, current) * numeric(record.product.buy)
      };
    });
  }

  function summarizeInventory(rows = []) {
    return (rows || []).reduce((summary, row) => {
      summary.productCount += 1;
      if (row.status === 'critical') summary.criticalCount += 1;
      else if (row.status === 'reorder') summary.reorderCount += 1;
      else summary.sufficientCount += 1;
      summary.stockValue += numeric(row.value);
      return summary;
    }, { productCount: 0, criticalCount: 0, reorderCount: 0, sufficientCount: 0, stockValue: 0 });
  }

  root.InventoryMath = Object.freeze({ calculateInventory, summarizeInventory });
})(typeof window !== 'undefined' ? window : globalThis);
