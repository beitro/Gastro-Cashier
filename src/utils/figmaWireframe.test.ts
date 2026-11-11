import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFigmaWireframeSvg } from './figmaWireframe';

test('generateFigmaWireframeSvg produces valid SVG document with all 5 POS Claymorphism frames', () => {
  const svg = generateFigmaWireframeSvg({
    restaurantName: 'Resto Nusantara & Co',
    totalTables: 36,
    availableTables: 32,
    occupiedTables: 4,
    paymentFlowMode: 'payment_last',
  });

  assert.equal(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
  assert.equal(svg.includes('<svg width="3720" height="2680"'), true);
  assert.equal(svg.trim().endsWith('</svg>'), true);

  // Verify all 9 core Figma artboard frame IDs exist for clean layer import
  assert.equal(svg.includes('id="Frame_01_Floor_Plan_Claymorphism"'), true);
  assert.equal(svg.includes('id="Frame_02_Order_Input_And_Payment_Mode"'), true);
  assert.equal(svg.includes('id="Frame_03_KDS_Dapur_Bar_Handoff"'), true);
  assert.equal(svg.includes('id="Frame_04_Checker_Waiter_Pencontrengan"'), true);
  assert.equal(svg.includes('id="Frame_05_Settlement_PB1_And_Thermal_Receipt"'), true);
  assert.equal(svg.includes('id="Frame_06_Login_NFC_Tag_And_PIN_Multi_Role"'), true);
  assert.equal(svg.includes('id="Frame_07_Owner_Executive_Cockpit"'), true);
  assert.equal(svg.includes('id="Frame_08_Finance_Workspace_PB1_And_Petty_Cash"'), true);
  assert.equal(svg.includes('id="Frame_09_Google_Sheets_And_Drive_Sync"'), true);
  assert.equal(svg.includes('id="Frame_10_Staff_Admin_PIN_And_Block_Console"'), true);
  assert.equal(svg.includes('id="Frame_11_Menu_Stock_And_Cancellation_Approval"'), true);
  assert.equal(svg.includes('id="Claymorphism_Design_Tokens_Strip"'), true);

  // Verify all 6 roles & QA PIN presets
  assert.equal(svg.includes('PIN: 4444 · NFC-OWNER-99'), true);
  assert.equal(svg.includes('PIN: 3333 · NFC-MANAGER-01'), true);
  assert.equal(svg.includes('PIN: 1111 · NFC-CASHIER-12'), true);
  assert.equal(svg.includes('PIN: 5555 · NFC-WAITER-01'), true);
  assert.equal(svg.includes('PIN: 6666 · NFC-KITCHEN-01'), true);
  assert.equal(svg.includes('PIN: 2222 · NFC-FINANCE-56'), true);

  // Verify Google Data Studio / Looker Studio callout
  assert.equal(svg.includes('Google Data Studio (Looker Studio)'), true);

  // Verify XML special character escaping so '&' never breaks Figma SVG parser
  assert.equal(svg.includes('Resto Nusantara &amp; Co'), true);
  assert.equal(svg.includes('32 Meja Hijau Pekat (Kosong)'), true);
  assert.equal(svg.includes('4 Meja Merah (Terisi / Lunas)'), true);
});

test('generateFigmaWireframeSvg reflects payment_first mode and active staff role when active', () => {
  const svg = generateFigmaWireframeSvg({
    paymentFlowMode: 'payment_first',
    totalTables: 36,
    occupiedTables: 6,
    currentRole: 'owner',
    staffName: 'Hendrawan Kusuma',
  });

  assert.equal(svg.includes('Payment First (Bayar Langsung)'), true);
  assert.equal(svg.includes('30 Kosong / 6 Terisi'), true);
  assert.equal(svg.includes('Hendrawan Kusuma'), true);
  assert.equal(svg.includes('(OWNER)'), true);
});
