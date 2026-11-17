/* scrubs-data.jsx — the Uniforms page's helpers: money, days, and the download of
   approved orders. Who may order and what is free live in uniform-rules.js. */

const money = (n) => '$' + (Number(n) || 0).toFixed(2);
const fmtDay = (ms) => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const colorName = (c) => (PD_UNIFORMS.COLORS[c] || PD_UNIFORMS.COLORS.black).name;

/* one row per item, for the person sending the order to the vendor */
function ordersCsv(orders) {
  const U = PD_UNIFORMS;
  const head = ['Ordered', 'Staff', 'Office', 'Job title', 'Logo', 'Embroidered name', 'Item', 'Category', 'Fit', 'Size', 'Color', 'Qty', 'Free', 'Employee-paid', 'Unit price', 'Employee pays by'];
  const rows = orders.flatMap(o => (o.payload.items || []).map(it => [
    fmtDay(Date.parse(o.createdAt)), o.submittedName, o.payload.office, o.payload.jobTitle, (U.LOGOS[o.payload.logo] || {}).name || '', o.payload.embroideredName,
    it.name, U.CAT_LABEL[it.cat], it.fit, it.size, colorName(it.color), it.qty, it.companyQty, it.employeeQty, money(it.price),
    it.employeeQty > 0 ? (o.payload.payMethod === 'card' ? 'Card' : 'Payroll deduction') : '',
  ]));
  return [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
function downloadOrders(orders) {
  const b = new Blob([ordersCsv(orders)], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = `uniform-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

Object.assign(window, { money, fmtDay, colorName, ordersCsv, downloadOrders });
