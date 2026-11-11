import { Transaction, RawMaterial } from '../types/pos';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface CreateSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  salesRowCount: number;
  inventoryRowCount: number;
}

/**
 * Extract spreadsheetId from either a raw ID or full Google Sheets URL.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Build values array for Sales & PB1 Sheet
 */
export function buildSalesSheetRows(sales: Transaction[]): (string | number)[][] {
  const headers = [
    'No Meja',
    'ID Bill Transaksi',
    'Waktu Bayar',
    'Metode Bayar',
    'Subtotal (Rp)',
    'Service Charge 5% (Rp)',
    'Pajak PB1 10% (Rp)',
    'Diskon (Rp)',
    'Total Akhir (Rp)',
    'Pramusaji',
    'Kasir',
    'Status',
  ];

  const rows = sales.map((tx) => [
    `#${tx.tableNumber}`,
    tx.id,
    tx.paidAt ? new Date(tx.paidAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
    tx.paymentMethod ? tx.paymentMethod.toUpperCase() : 'CASH',
    tx.subtotal,
    tx.serviceChargeAmount,
    tx.taxAmount,
    tx.discountAmount,
    tx.totalAmount,
    tx.waiterName || '-',
    tx.cashierName || 'Budi Prasetyo',
    'LUNAS',
  ]);

  return [headers, ...rows];
}

/**
 * Build values array for BOM Inventory Sheet
 */
export function buildInventorySheetRows(materials: RawMaterial[]): (string | number)[][] {
  const headers = [
    'ID Bahan',
    'Nama Bahan Baku',
    'Zona Penyimpanan',
    'Stok Terkini',
    'Satuan',
    'Batas Minimum ROP',
    'HPP Satuan (Rp)',
    'Total Nilai Asset (Rp)',
    'Status Stok',
  ];

  const rows = materials.map((m) => {
    const isLow = m.currentStock <= m.minStock;
    return [
      m.id,
      m.name,
      m.storageZone,
      m.currentStock,
      m.unit,
      m.minStock,
      m.costPerUnit,
      Math.round(m.currentStock * m.costPerUnit),
      isLow ? 'PERLU RESTOCK (DI BAWAH ROP)' : 'AMAN',
    ];
  });

  return [headers, ...rows];
}

/**
 * Create a new RestoPOS Google Spreadsheet with two dedicated tabs:
 * 1. Rekap Penjualan & PB1
 * 2. Inventaris Stok BOM
 */
export async function createRestoSpreadsheet(
  accessToken: string,
  options: {
    title?: string;
    sales: Transaction[];
    materials: RawMaterial[];
  }
): Promise<CreateSpreadsheetResult> {
  const title =
    options.title ||
    `RestoPOS - Laporan Operasional & PB1 (${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')})`;

  // 1. Create Spreadsheet with two sheets
  const createRes = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: 'Rekap Penjualan & PB1',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'Inventaris Stok BOM',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    const message = errorData?.error?.message || `Gagal membuat Google Spreadsheet (HTTP ${createRes.status})`;
    throw new Error(message);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl =
    createdData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Populate Sales Sheet Data
  const salesRows = buildSalesSheetRows(options.sales);
  await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/'Rekap Penjualan & PB1'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'Rekap Penjualan & PB1'!A1",
        majorDimension: 'ROWS',
        values: salesRows,
      }),
    }
  );

  // 3. Populate Inventory Sheet Data
  const inventoryRows = buildInventorySheetRows(options.materials);
  await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/'Inventaris Stok BOM'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'Inventaris Stok BOM'!A1",
        majorDimension: 'ROWS',
        values: inventoryRows,
      }),
    }
  );

  return {
    spreadsheetId,
    spreadsheetUrl,
    salesRowCount: options.sales.length,
    inventoryRowCount: options.materials.length,
  };
}

/**
 * Export Sales & PB1 into an existing Google Spreadsheet
 */
export async function exportSalesToExistingSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  sales: Transaction[],
  mode: 'overwrite' | 'append' = 'overwrite'
): Promise<{ rowCount: number; spreadsheetUrl: string }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const rows = buildSalesSheetRows(sales);

  const endpoint =
    mode === 'append'
      ? `${SHEETS_API_BASE}/${cleanId}/values/'Rekap Penjualan & PB1'!A1:append?valueInputOption=USER_ENTERED`
      : `${SHEETS_API_BASE}/${cleanId}/values/'Rekap Penjualan & PB1'!A1?valueInputOption=USER_ENTERED`;

  const method = mode === 'append' ? 'POST' : 'PUT';

  const res = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: "'Rekap Penjualan & PB1'!A1",
      majorDimension: 'ROWS',
      values: mode === 'append' ? rows.slice(1) : rows,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal ekspor ke Google Sheets (HTTP ${res.status})`);
  }

  return {
    rowCount: sales.length,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
  };
}

/**
 * Export BOM Inventory into an existing Google Spreadsheet
 */
export async function exportInventoryToExistingSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  materials: RawMaterial[]
): Promise<{ rowCount: number; spreadsheetUrl: string }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const rows = buildInventorySheetRows(materials);

  const res = await fetch(
    `${SHEETS_API_BASE}/${cleanId}/values/'Inventaris Stok BOM'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'Inventaris Stok BOM'!A1",
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal update stok ke Google Sheets (HTTP ${res.status})`);
  }

  return {
    rowCount: materials.length,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
  };
}

function formatCsvValue(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerBlobDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

/**
 * Generates and downloads a UTF-8 BOM CSV file of Sales & PB1 rows
 * ready for direct import into Google Data Studio (Looker Studio) or Google Sheets.
 */
export function downloadSalesCsv(
  sales: Transaction[],
  filename: string = `Rekap-Omzet-PB1-${new Date().toISOString().slice(0, 10)}.csv`
): void {
  const rows = buildSalesSheetRows(sales);
  const csvString = '\uFEFF' + rows.map((row) => row.map(formatCsvValue).join(',')).join('\r\n');
  triggerBlobDownload(csvString, filename, 'text/csv;charset=utf-8;');
}

/**
 * Generates and downloads a UTF-8 BOM CSV file of BOM Inventory rows.
 */
export function downloadInventoryCsv(
  materials: RawMaterial[],
  filename: string = `Inventaris-BOM-${new Date().toISOString().slice(0, 10)}.csv`
): void {
  const rows = buildInventorySheetRows(materials);
  const csvString = '\uFEFF' + rows.map((row) => row.map(formatCsvValue).join(',')).join('\r\n');
  triggerBlobDownload(csvString, filename, 'text/csv;charset=utf-8;');
}

/**
 * Copies tab-separated rows of Sales & PB1 to clipboard so users can
 * paste (Ctrl+V) directly into Google Sheets or Looker Studio data tables.
 */
export async function copySalesTsvToClipboard(sales: Transaction[]): Promise<number> {
  const rows = buildSalesSheetRows(sales);
  const tsvString = rows.map((row) => row.join('\t')).join('\n');
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(tsvString);
  }
  return sales.length;
}
