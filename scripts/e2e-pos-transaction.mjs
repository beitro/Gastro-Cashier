import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = String(process.env.POS_E2E_API_URL || '').replace(/\/$/, '');
const pin = String(process.env.POS_E2E_PIN || '');
const tableCode = String(process.env.POS_E2E_TABLE_CODE || '01');
if (!baseUrl || !/^\d{4}$/.test(pin)) {
  throw new Error('Set POS_E2E_API_URL and POS_E2E_PIN (4 digits). This test must target the isolated gastro-test-seed preview API.');
}
if (/production|gastro-cashier\.vercel\.app/i.test(baseUrl)) {
  throw new Error('Refusing to run POS E2E against a production URL.');
}
async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  assert.ok(response.ok, method + ' ' + path + ' failed (' + response.status + '): ' + (data.error || 'unknown'));
  return data;
}

const auth = await call('/api/auth/pin', { method: 'POST', body: { pin } });
assert.ok(auth.token && auth.staff?.id, 'PIN login must return a token and staff UUID');
const token = auth.token;
const [tables, menu] = await Promise.all([
  call('/api/tables', { token }),
  call('/api/menu', { token }),
]);
const table = tables.find(row => row.table_code === tableCode && row.table_state === 'available');
assert.ok(table?.table_id, 'An available fixture table must exist');
const menuItem = menu.find(row => row.sku === 'food-1');
assert.ok(menuItem?.id, 'Fixture menu SKU food-1 must exist');

const session = await call('/api/sessions', {
  token, method: 'POST', body: { tableId: table.table_id, guestCount: 1 },
});
assert.ok(session.id && session.id !== table.table_id, 'Session must have a database UUID distinct from table UUID');

const order = await call('/api/sessions/' + session.id + '/orders', {
  token, method: 'POST',
  body: { items: [{ menuItemId: menuItem.id, quantity: 1, notes: 'POS E2E test' }] },
});
assert.ok(order.batch?.id && order.items?.length === 1, 'Order batch and item must be persisted');
const subtotal = Number(order.items[0].line_total);
const service = subtotal * Number(session.service_charge_rate);
const tax = (subtotal + service) * Number(session.tax_rate);
const total = Number((subtotal + service + tax).toFixed(2));
const idempotencyKey = 'pos-e2e-' + randomUUID();

const payment = await call('/api/sessions/' + session.id + '/payments', {
  token, method: 'POST',
  body: { method: 'cash', discountAmount: 0, cashReceived: total, idempotencyKey },
});
assert.equal(Number(payment.total_amount), total, 'Server payment total must match the calculated fixture total');
assert.ok(payment.receipt_number && payment.id, 'Payment must return a persisted receipt number and UUID');

const finalTables = await call('/api/tables', { token });
const finalTable = finalTables.find(row => row.table_id === table.table_id);
assert.equal(finalTable?.table_state, 'available', 'Table must return to available after settlement');
console.log(JSON.stringify({
  ok: true,
  staffId: auth.staff.id,
  tableCode,
  tableId: table.table_id,
  sessionId: session.id,
  orderBatchId: order.batch.id,
  orderItemId: order.items[0].id,
  paymentId: payment.id,
  receiptNumber: payment.receipt_number,
  subtotal, service, tax, total,
  tableReleased: finalTable.table_state === 'available',
}, null, 2));
