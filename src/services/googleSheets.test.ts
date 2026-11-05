import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpreadsheetId,
  buildSalesSheetRows,
  buildInventorySheetRows,
} from './googleSheets';
import { Transaction, RawMaterial } from '../types/pos';

test('extractSpreadsheetId extracts clean ID from full URL and bare ID', () => {
  const url1 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
  assert.equal(extractSpreadsheetId(url1), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

  const url2 = 'https://docs.google.com/spreadsheets/d/abc-123_XYZ/edit';
  assert.equal(extractSpreadsheetId(url2), 'abc-123_XYZ');

  const bareId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  assert.equal(extractSpreadsheetId(bareId), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
});

test('buildSalesSheetRows constructs correct header and rows', () => {
  const sampleSales: Transaction[] = [
    {
      id: 'TRX-101',
      tableId: 'T01',
      tableNumber: '01',
      area: 'indoor',
      guestCount: 2,
      waiterName: 'Doni',
      cashierName: 'Budi',
      openedAt: '2026-11-04T10:00:00.000Z',
      paidAt: '2026-11-04T10:45:00.000Z',
      status: 'settled',
      isPaid: true,
      paymentMethod: 'qris',
      subtotal: 100000,
      serviceChargeRate: 0.05,
      serviceChargeAmount: 5000,
      taxRate: 0.1,
      taxAmount: 10500,
      discountAmount: 0,
      totalAmount: 115500,
      batches: [],
      allCurrentItems: [],
    },
  ];

  const sheetData = buildSalesSheetRows(sampleSales);
  assert.equal(sheetData.length, 2); // 1 header + 1 data row
  assert.equal(sheetData[0][0], 'No Meja');
  assert.equal(sheetData[0][1], 'ID Bill Transaksi');
  assert.equal(sheetData[1][0], '#01');
  assert.equal(sheetData[1][1], 'TRX-101');
  assert.equal(sheetData[1][3], 'QRIS');
  assert.equal(sheetData[1][4], 100000);
  assert.equal(sheetData[1][8], 115500);
});

test('buildInventorySheetRows constructs correct header and flags low stock', () => {
  const sampleMaterials: RawMaterial[] = [
    {
      id: 'mat-1',
      name: 'Beras Pandan Wangi Super',
      unit: 'kg',
      currentStock: 4,
      minStock: 10,
      costPerUnit: 16000,
      storageZone: 'Dry Storage',
    },
    {
      id: 'mat-2',
      name: 'Ayam Karkas Segar 1.0kg',
      unit: 'ekor',
      currentStock: 25,
      minStock: 12,
      costPerUnit: 34000,
      storageZone: 'Walk-in Chiller',
    },
  ];

  const sheetData = buildInventorySheetRows(sampleMaterials);
  assert.equal(sheetData.length, 3); // 1 header + 2 data rows
  assert.equal(sheetData[0][0], 'ID Bahan');
  assert.equal(sheetData[1][8], 'PERLU RESTOCK (DI BAWAH ROP)');
  assert.equal(sheetData[2][8], 'AMAN');
});
