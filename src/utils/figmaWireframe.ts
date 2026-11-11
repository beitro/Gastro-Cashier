import { PaymentFlowMode, UserRole } from '../types/pos';

export interface FigmaWireframeOptions {
  restaurantName?: string;
  totalTables?: number;
  availableTables?: number;
  occupiedTables?: number;
  paymentFlowMode?: PaymentFlowMode;
  currentRole?: UserRole;
  staffName?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an exhaustive, multi-screen Claymorphism Figma wireframe kit as an SVG document.
 * Dropping this .svg file into Figma imports editable vector Frames, Groups,
 * Claymorphism cards, rounded buttons, badges, and typography layers.
 *
 * Covers all 9 screens & workflows:
 * 1. Floor Plan (36 Meja)
 * 2. Order Modal & Mode Bayar (Payment First vs Payment Last)
 * 3. KDS Live Station & Handoff ke Waiter
 * 4. Checker Waiter (Pencontrengan Meja)
 * 5. Settlement Kasir, PB1 10% & Struk Thermal
 * 6. Login NFC Tag & PIN Keypad Multi-Role (Owner, Kasir, Finance)
 * 7. Executive Cockpit Owner (Role: Owner)
 * 8. Workspace Pembukuan & Pajak PB1 (Role: Finance)
 * 9. Integrasi Google Sheets & Drive (Ekspor Z-Report & BOM)
 * + Design System Tokens, Swatches & Role Permissions Matrix
 */
export function generateFigmaWireframeSvg(options: FigmaWireframeOptions = {}): string {
  const restaurantName = escapeXml(options.restaurantName || 'Resto Nusantara');
  const totalTables = options.totalTables ?? 36;
  const occupiedTables = options.occupiedTables ?? 4;
  const availableTables = options.availableTables ?? Math.max(0, totalTables - occupiedTables);
  const activeMode: PaymentFlowMode = options.paymentFlowMode || 'payment_last';
  const modeLabel =
    activeMode === 'payment_first'
      ? 'Payment First (Bayar Langsung)'
      : 'Payment Last (Bayar Belakang)';
  const currentRole = options.currentRole || 'cashier';
  const staffName = escapeXml(options.staffName || 'Budi Prasetyo');

  // Mini table cards generator for Artboard 01
  const miniTablesMarkup = Array.from({ length: 12 }, (_, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const x = 104 + col * 146;
    const y = 398 + row * 126;
    const num = String(idx + 1).padStart(2, '0');
    const isOcc = idx === 1 || idx === 4 || idx === 8;
    const isPaidOcc = idx === 1;
    const fill = isOcc ? 'url(#clayCrimson)' : 'url(#clayEmerald)';
    const stroke = isOcc ? '#fb7185' : '#34d399';
    const statusBadge = isOcc ? (isPaidOcc ? 'LUNAS' : 'TERISI') : 'KOSONG';
    const subline = isOcc ? 'Rp 142.065' : '+ Buka Meja';
    const footerRight = isOcc ? '2/3 Menu' : 'Siap Pakai';

    return `
      <g id="Table_Card_${num}">
        <rect x="${x}" y="${y}" width="134" height="112" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="1.5" filter="url(#clayShadowSm)" />
        <rect x="${x + 4}" y="${y + 3}" width="126" height="8" rx="4" fill="#ffffff" fill-opacity="0.22" />
        <text x="${x + 14}" y="${y + 24}" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ecfdf5">MEJA</text>
        <text x="${x + 14}" y="${y + 49}" font-family="JetBrains Mono, monospace" font-size="22" font-weight="800" fill="#ffffff">${num}</text>
        <rect x="${x + 74}" y="${y + 13}" width="48" height="18" rx="8" fill="#0f172a" fill-opacity="0.26" />
        <text x="${x + 98}" y="${y + 25}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="8" font-weight="800" fill="#ffffff">${statusBadge}</text>
        <rect x="${x + 12}" y="${y + 60}" width="110" height="22" rx="9" fill="#ffffff" fill-opacity="0.18" />
        <text x="${x + 67}" y="${y + 75}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#ffffff">${subline}</text>
        <line x1="${x + 12}" y1="${y + 90}" x2="${x + 122}" y2="${y + 90}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1" />
        <text x="${x + 14}" y="${y + 104}" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#f8fafc">Indoor</text>
        <text x="${x + 120}" y="${y + 104}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#f8fafc">${footerRight}</text>
      </g>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="3720" height="2680" viewBox="0 0 3720 2680" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>RestoPOS Touch — Claymorphism Figma Wireframe Master Kit</title>
  <desc>Exhaustive multi-screen Claymorphism POS wireframe for Figma: Multi-Role Login NFC/PIN, Owner Cockpit, Finance PB1 Workspace, Floor Plan, Order Dual Mode, KDS Live Handoff, Checker Waiter, Settlement Kasir, and Google Sheets.</desc>

  <defs>
    <filter id="clayShadow" x="-8%" y="-6%" width="116%" height="120%" filterUnits="objectBoundingBox">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.08" />
    </filter>
    <filter id="clayShadowSm" x="-8%" y="-6%" width="116%" height="120%" filterUnits="objectBoundingBox">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10" />
    </filter>
    <linearGradient id="clayEmerald" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#065f46" />
    </linearGradient>
    <linearGradient id="clayCrimson" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#9f1239" />
    </linearGradient>
    <linearGradient id="clayDark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="clayIndigo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4338ca" />
      <stop offset="100%" stop-color="#312e81" />
    </linearGradient>
    <linearGradient id="clayAmber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
  </defs>

  <!-- Outer Figma Sheet Canvas -->
  <rect id="Figma_Sheet_Background" x="0" y="0" width="3720" height="2680" fill="#dde5f0" />

  <!-- Sheet Header Banner -->
  <g id="Header_Specification_Banner">
    <rect x="64" y="32" width="3592" height="96" rx="22" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" filter="url(#clayShadow)" />
    <rect x="88" y="56" width="48" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="112" y="86" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="800" fill="#ffffff">RP</text>
    <text x="154" y="74" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800" fill="#0f172a">RestoPOS Touch — Claymorphism UI &amp; Figma Master Wireframe</text>
    <text x="154" y="100" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#475569">Outlet: ${restaurantName} · ${totalTables} Meja (${availableTables} Kosong / ${occupiedTables} Terisi) · Mode: ${escapeXml(modeLabel)} · Staff Aktif: ${staffName} (${currentRole.toUpperCase()}) · Drag &amp; Drop file .svg ini langsung ke Figma</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ROW 1: CORE OPERATIONAL TOUCH SCREENS (FRAMES 01 TO 05)               -->
  <!-- ===================================================================== -->

  <!-- ARTBOARD 01: FLOOR PLAN (36 MEJA CLAYMORPHISM) -->
  <g id="Frame_01_Floor_Plan_Claymorphism">
    <text x="64" y="168" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">01 / FLOOR PLAN &amp; TOP BAR (1440x900 CLAYMORPHISM)</text>
    <rect x="64" y="182" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Clay Top Navbar -->
    <rect x="80" y="198" width="632" height="56" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="94" y="210" width="32" height="32" rx="10" fill="url(#clayEmerald)" />
    <text x="134" y="231" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">RestoPOS</text>

    <!-- Nav Well -->
    <rect x="212" y="206" width="348" height="40" rx="13" fill="#dde5f0" />
    <rect x="217" y="210" width="76" height="32" rx="10" fill="url(#clayDark)" />
    <text x="255" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#ffffff">Floor Plan</text>
    <text x="328" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">KDS Dapur</text>
    <text x="392" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Checker</text>
    <text x="454" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">BOM Stok</text>
    <text x="520" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Omzet PB1</text>

    <!-- Figma Download CTA in Topbar -->
    <rect x="572" y="208" width="126" height="36" rx="11" fill="url(#clayIndigo)" />
    <text x="635" y="230" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Figma Wireframe</text>

    <!-- Filter Clay Panel -->
    <rect x="84" y="268" width="624" height="118" rx="20" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="104" y="294" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">ZONA MEJA &amp; FILTER STATUS</text>
    <rect x="104" y="306" width="84" height="36" rx="12" fill="url(#clayDark)" />
    <text x="146" y="328" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Semua (${totalTables})</text>
    <rect x="196" y="306" width="82" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="237" y="328" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">Indoor (18)</text>
    <rect x="286" y="306" width="86" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="329" y="328" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">Outdoor (12)</text>
    <rect x="380" y="306" width="68" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="414" y="328" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">VIP (6)</text>

    <!-- Search Well -->
    <rect x="466" y="306" width="222" height="36" rx="12" fill="#dde5f0" />
    <text x="484" y="328" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Cari nomor meja...</text>
    <text x="104" y="368" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#059669">${availableTables} Meja Hijau Pekat (Kosong)</text>
    <text x="312" y="368" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#e11d48">${occupiedTables} Meja Merah (Terisi / Lunas)</text>

    <!-- 12 Table Clay Cards Grid -->
    ${miniTablesMarkup}
  </g>

  <!-- ARTBOARD 02: ORDER MODAL (PAYMENT LAST & PAYMENT FIRST) -->
  <g id="Frame_02_Order_Input_And_Payment_Mode">
    <text x="768" y="168" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">02 / INPUT PESANAN &amp; AKTIVASI MODE BAYAR (FIRST vs LAST)</text>
    <rect x="768" y="182" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Modal Top Clay Bar with Mode Switcher -->
    <rect x="784" y="198" width="632" height="68" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="804" y="226" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="800" fill="#0f172a">Buka Meja #02 · Input Pesanan</text>
    <text x="804" y="248" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#64748b">Pilih Kategori Resto: Payment Last (Open Bill) / Payment First (Kasir)</text>

    <!-- Mode Toggle Well -->
    <rect x="1142" y="208" width="258" height="46" rx="14" fill="#dde5f0" />
    <rect x="1147" y="213" width="122" height="36" rx="11" fill="${activeMode === 'payment_last' ? 'url(#clayDark)' : '#ffffff'}" />
    <text x="1208" y="235" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="${activeMode === 'payment_last' ? '#ffffff' : '#475569'}">Bayar Belakang</text>
    <rect x="1273" y="213" width="122" height="36" rx="11" fill="${activeMode === 'payment_first' ? 'url(#clayEmerald)' : '#ffffff'}" />
    <text x="1334" y="235" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="${activeMode === 'payment_first' ? '#ffffff' : '#475569'}">Bayar Langsung</text>

    <!-- Left Menu Column -->
    <rect x="784" y="280" width="382" height="516" rx="22" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="800" y="296" width="350" height="42" rx="13" fill="#dde5f0" />
    <rect x="805" y="301" width="92" height="32" rx="10" fill="url(#clayDark)" />
    <text x="851" y="321" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Semua Menu</text>
    <text x="952" y="321" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Dapur</text>
    <text x="1028" y="321" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Bar</text>
    <text x="1102" y="321" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Snack</text>

    <!-- 4 Menu Clay Cards -->
    <g id="Menu_Cards_Grid">
      <rect x="800" y="354" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="814" y="376" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#b45309">DAPUR · STOK 50</text>
      <text x="814" y="398" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Nasi Goreng Spesial</text>
      <text x="814" y="464" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 38.000</text>
      <rect x="900" y="444" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="928" y="463" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>

      <rect x="982" y="354" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="996" y="376" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#b45309">DAPUR · STOK 35</text>
      <text x="996" y="398" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Ayam Bakar Madu</text>
      <text x="996" y="464" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 42.000</text>
      <rect x="1082" y="444" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="1110" y="463" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>
    </g>

    <!-- Right Order Cart Clay Panel -->
    <rect x="1180" y="280" width="236" height="516" rx="22" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="1198" y="310" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Pesanan Meja 02</text>
    <text x="1198" y="328" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#047857">BATCH #1 · 2 MENU</text>

    <rect x="1196" y="342" width="204" height="250" rx="16" fill="#dde5f0" />
    <rect x="1206" y="354" width="184" height="64" rx="12" fill="#ffffff" />
    <text x="1218" y="376" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">2x Nasi Goreng Spesial</text>
    <text x="1218" y="394" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="600" fill="#64748b">Pedas Sedang · Rp 76.000</text>
    <rect x="1206" y="428" width="184" height="64" rx="12" fill="#ffffff" />
    <text x="1218" y="450" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">2x Kopi Susu Aren</text>
    <text x="1218" y="468" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="600" fill="#64748b">Less Sugar · Rp 48.000</text>

    <text x="1198" y="622" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">Subtotal</text>
    <text x="1398" y="622" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">Rp 124.000</text>
    <text x="1198" y="642" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">Service 5% + PB1 10%</text>
    <text x="1398" y="642" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">Rp 19.220</text>
    <text x="1198" y="672" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Total Estimasi</text>
    <text x="1398" y="672" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#047857">Rp 143.220</text>

    <rect x="1196" y="694" width="204" height="44" rx="13" fill="url(#clayEmerald)" />
    <text x="1298" y="720" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">KIRIM &amp; CETAK DAPUR / BAR</text>
    <rect x="1196" y="746" width="204" height="36" rx="11" fill="url(#clayIndigo)" />
    <text x="1298" y="768" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">BAYAR LANGSUNG + STRUK</text>
  </g>

  <!-- ARTBOARD 03: KDS LIVE STATION & OPER KE WAITER -->
  <g id="Frame_03_KDS_Dapur_Bar_Handoff">
    <text x="1472" y="168" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">03 / KDS LIVE STATION (AUTO-HIDE &amp; OPER KE WAITER)</text>
    <rect x="1472" y="182" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <rect x="1488" y="198" width="632" height="58" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="1504" y="210" width="34" height="34" rx="11" fill="url(#clayAmber)" />
    <text x="1550" y="232" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">KDS Live Station (Dapur &amp; Bar)</text>
    <rect x="1956" y="209" width="148" height="36" rx="11" fill="url(#clayEmerald)" />
    <text x="2030" y="231" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Checker · 1 Siap Antar</text>

    <!-- Handoff Notification Strip -->
    <rect x="1488" y="270" width="632" height="44" rx="14" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="1508" y="296" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#065f46">✓ Menu selesai dimasak otomatis hilang dari KDS &amp; masuk antrean Siap Antar Waiter!</text>

    <!-- KDS Ticket Card 1 (Ready to Handoff) -->
    <rect x="1488" y="328" width="306" height="462" rx="22" fill="#ffffff" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <rect x="1500" y="340" width="282" height="48" rx="14" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="1516" y="369" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#065f46">Meja #05 · 35m</text>
    <text x="1766" y="369" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#047857">MATANG SIAP OPER</text>

    <rect x="1504" y="402" width="274" height="84" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="1518" y="426" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">1x Tahu Cabe Garam Crispy</text>
    <text x="1518" y="444" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#b45309">Catatan: Goreng garing</text>
    <rect x="1518" y="452" width="136" height="26" rx="8" fill="url(#clayEmerald)" />
    <text x="1586" y="469" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">Oper ke Waiter →</text>

    <rect x="1504" y="724" width="274" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="1641" y="752" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">SELESAI &amp; OPER MEJA #05</text>

    <!-- KDS Ticket Card 2 (Cooking) -->
    <rect x="1814" y="328" width="306" height="462" rx="22" fill="#ffffff" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <rect x="1826" y="340" width="282" height="48" rx="14" fill="#fffbeb" stroke="#fde68a" />
    <text x="1842" y="369" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#92400e">Meja #21 · 20m</text>
    <text x="2092" y="369" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#b45309">SEDANG DIMASAK</text>

    <rect x="1830" y="402" width="274" height="84" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="1844" y="426" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">2x Sate Ayam Madura</text>
    <text x="1844" y="444" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Bumbu kacang kental</text>
    <rect x="1844" y="452" width="152" height="26" rx="8" fill="url(#clayAmber)" />
    <text x="1920" y="469" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">Dimasak · Tandai Matang</text>

    <rect x="1830" y="724" width="274" height="48" rx="14" fill="url(#clayIndigo)" />
    <text x="1967" y="752" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">SELESAI &amp; OPER MEJA #21</text>
  </g>

  <!-- ARTBOARD 04: CHECKER WAITER (PENCONTRENGAN SAJIAN) -->
  <g id="Frame_04_Checker_Waiter_Pencontrengan">
    <text x="2176" y="168" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">04 / CHECKER WAITER (PENCONTRENGAN &amp; OPERAN KDS)</text>
    <rect x="2176" y="182" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <rect x="2192" y="198" width="632" height="58" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="2208" y="210" width="34" height="34" rx="11" fill="url(#clayEmerald)" />
    <text x="2254" y="232" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Checker Waiter (Pencontrengan Meja)</text>

    <!-- Main Checklist Clay Panel -->
    <rect x="2192" y="268" width="632" height="526" rx="22" fill="#f8fafc" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <text x="2216" y="302" font-family="JetBrains Mono, monospace" font-size="16" font-weight="800" fill="#0f172a">Meja #05 · Zona Indoor · 3 Tamu</text>
    <text x="2800" y="302" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#059669">Progres: 2/3 Menu (67%)</text>
    <rect x="2216" y="316" width="584" height="12" rx="6" fill="#dde5f0" />
    <rect x="2216" y="316" width="390" height="12" rx="6" fill="url(#clayEmerald)" />

    <!-- Checklist Rows -->
    <rect x="2216" y="348" width="584" height="72" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2232" y="366" width="36" height="36" rx="10" fill="url(#clayEmerald)" />
    <text x="2250" y="390" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#ffffff">✓</text>
    <text x="2284" y="382" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-decoration="line-through">2x Nasi Goreng Spesial Resto</text>
    <text x="2284" y="400" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#059669">Sudah Tersaji di Meja</text>

    <rect x="2216" y="432" width="584" height="72" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2232" y="450" width="36" height="36" rx="10" fill="url(#clayEmerald)" />
    <text x="2250" y="474" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#ffffff">✓</text>
    <text x="2284" y="466" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-decoration="line-through">3x Es Teh Manis Jasmine</text>
    <text x="2284" y="484" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#059669">Sudah Tersaji di Meja</text>

    <rect x="2216" y="516" width="584" height="82" rx="16" fill="#ecfdf5" stroke="#34d399" stroke-width="1.5" />
    <rect x="2232" y="538" width="36" height="36" rx="10" fill="#ffffff" stroke="#059669" stroke-width="2" />
    <text x="2284" y="550" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">1x Tahu Cabe Garam Crispy</text>
    <text x="2284" y="570" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#047857">SIAP DIANTAR (Dioper dari KDS Dapur)</text>
    <rect x="2644" y="538" width="140" height="38" rx="11" fill="url(#clayEmerald)" />
    <text x="2714" y="561" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Antar &amp; Contreng</text>

    <!-- Bottom Action Bar -->
    <rect x="2216" y="736" width="584" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="2508" y="764" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">CONTRENG SEMUA TERSAJI ✓</text>
  </g>

  <!-- ARTBOARD 05: SETTLEMENT KASIR, PAJAK PB1 10% & STRUK SAH -->
  <g id="Frame_05_Settlement_PB1_And_Thermal_Receipt">
    <text x="2880" y="168" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">05 / SETTLEMENT KASIR, PAJAK PB1 10% &amp; AUTO-ROUTING STRUK</text>
    <rect x="2880" y="182" width="776" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Left Settlement Controls -->
    <rect x="2898" y="198" width="448" height="594" rx="22" fill="#f8fafc" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <text x="2920" y="232" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Pembayaran &amp; Tutup Meja #05</text>
    <text x="2920" y="252" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#64748b">Pilih Metode Pembayaran &amp; Diskon Promo</text>

    <!-- Payment Method Clay Buttons -->
    <rect x="2920" y="272" width="130" height="56" rx="16" fill="url(#clayEmerald)" />
    <text x="2985" y="305" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#ffffff">TUNAI (CASH)</text>
    <rect x="3060" y="272" width="130" height="56" rx="16" fill="#ffffff" stroke="#cbd5e1" />
    <text x="3125" y="305" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#1e293b">QRIS DINAMIS</text>
    <rect x="3200" y="272" width="124" height="56" rx="16" fill="#ffffff" stroke="#cbd5e1" />
    <text x="3262" y="305" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#1e293b">DEBIT / KARTU</text>

    <!-- Tax & PB1 Summary Card -->
    <rect x="2920" y="348" width="404" height="340" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <text x="2942" y="380" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Subtotal Pesanan</text>
    <text x="3302" y="380" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 123.000</text>
    <text x="2942" y="410" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Service Charge (5%)</text>
    <text x="3302" y="410" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 6.150</text>
    <text x="2942" y="440" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Pajak Restoran PB1 (10%)</text>
    <text x="3302" y="440" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 12.915</text>
    <line x1="2942" y1="462" x2="3302" y2="462" stroke="#e2e8f0" stroke-width="1.5" />
    <text x="2942" y="496" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="800" fill="#0f172a">GRAND TOTAL</text>
    <text x="3302" y="496" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800" fill="#047857">Rp 142.065</text>
    <text x="2942" y="532" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#059669">✓ Stok BOM Terpotong · Omzet Tercatat · Meja Kembali Hijau</text>

    <rect x="2920" y="714" width="404" height="58" rx="16" fill="url(#clayEmerald)" />
    <text x="3122" y="748" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">BAYAR LUNAS &amp; CETAK STRUK SAH</text>

    <!-- Right Thermal Receipt Preview -->
    <rect x="3364" y="198" width="274" height="594" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-dasharray="6 4" filter="url(#clayShadowSm)" />
    <text x="3501" y="236" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" font-weight="800" fill="#0f172a">RESTO NUSANTARA</text>
    <text x="3501" y="254" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600" fill="#64748b">STRUK PEMBAYARAN SAH</text>
    <line x1="3384" y1="272" x2="3618" y2="272" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="296" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Meja: #05 (Indoor)</text>
    <text x="3384" y="314" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Kasir: Budi Prasetyo</text>
    <line x1="3384" y1="330" x2="3618" y2="330" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="356" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">2x Nasi Goreng Spesial</text>
    <text x="3618" y="374" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 76.000</text>
    <text x="3384" y="400" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">3x Es Teh Jasmine</text>
    <text x="3618" y="418" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 27.000</text>
    <text x="3384" y="444" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">1x Tahu Cabe Garam</text>
    <text x="3618" y="462" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 20.000</text>
    <line x1="3384" y1="484" x2="3618" y2="484" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="510" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Subtotal      Rp 123.000</text>
    <text x="3384" y="530" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Service 5%     Rp  6.150</text>
    <text x="3384" y="550" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">PB1 10%       Rp 12.915</text>
    <line x1="3384" y1="568" x2="3618" y2="568" stroke="#0f172a" />
    <text x="3384" y="594" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#0f172a">TOTAL         Rp 142.065</text>
    <text x="3384" y="620" font-family="JetBrains Mono, monospace" font-size="10" fill="#047857">TUNAI         Rp 150.000</text>
    <text x="3384" y="640" font-family="JetBrains Mono, monospace" font-size="10" fill="#047857">KEMBALI        Rp  7.935</text>
    <rect x="3388" y="684" width="226" height="40" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="3501" y="709" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="800" fill="#065f46">STATUS: LUNAS SAH ✓</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ROW 2: NEW SCREENS — NFC/PIN LOGIN, OWNER COCKPIT, FINANCE PB1, SHEETS -->
  <!-- ===================================================================== -->

  <!-- ARTBOARD 06: LOGIN NFC TAG & PIN MULTI-ROLE -->
  <g id="Frame_06_Login_NFC_Tag_And_PIN_Multi_Role">
    <text x="64" y="864" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">06 / OTORISASI AKSES: LOGIN NFC TAG &amp; INPUT PIN ROLE STAFF</text>
    <rect x="64" y="878" width="664" height="660" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Modal Box -->
    <rect x="94" y="904" width="604" height="608" rx="24" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />

    <!-- Modal Header -->
    <rect x="110" y="920" width="572" height="64" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="124" y="932" width="40" height="40" rx="12" fill="url(#clayEmerald)" />
    <text x="176" y="952" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Otorisasi Akses RestoPOS</text>
    <text x="176" y="968" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#059669">Login NFC Tag Sensor / Input PIN Role Staff</text>

    <!-- Tabs: PIN vs NFC -->
    <rect x="110" y="996" width="572" height="44" rx="14" fill="#dde5f0" />
    <rect x="115" y="1000" width="280" height="36" rx="11" fill="url(#clayDark)" />
    <text x="255" y="1023" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">Input PIN 4-Digit (Keypad)</text>
    <rect x="400" y="1000" width="276" height="36" rx="11" fill="#ffffff" />
    <text x="538" y="1023" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">Tap Kartu NFC Staff</text>

    <!-- PIN Keypad Left Box -->
    <rect x="110" y="1052" width="260" height="320" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <!-- PIN Dots -->
    <rect x="130" y="1066" width="220" height="42" rx="12" fill="#dde5f0" />
    <circle cx="180" cy="1087" r="8" fill="#059669" />
    <circle cx="220" cy="1087" r="8" fill="#059669" />
    <circle cx="260" cy="1087" r="8" fill="#059669" />
    <circle cx="300" cy="1087" r="8" fill="#cbd5e1" />

    <!-- 3x4 Keypad Grid -->
    <g id="Keypad_Grid">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const kx = 130 + col * 76;
        const ky = 1120 + row * 58;
        return `
          <rect x="${kx}" y="${ky}" width="68" height="48" rx="12" fill="#f8fafc" stroke="#cbd5e1" filter="url(#clayShadowSm)" />
          <text x="${kx + 34}" y="${ky + 30}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#0f172a">${k}</text>
        `;
      }).join('\n')}
    </g>

    <!-- Virtual NFC Cards Right Box -->
    <rect x="382" y="1052" width="300" height="320" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <text x="398" y="1078" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">SIMULASI TAP NFC &amp; PIN 6 ROLE:</text>

    <!-- Card 1: Owner -->
    <rect x="398" y="1090" width="268" height="44" rx="10" fill="#fffbeb" stroke="#fcd34d" />
    <text x="412" y="1110" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#92400e">👑 Owner (Hendrawan)</text>
    <text x="412" y="1126" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#b45309">PIN: 4444 · NFC-OWNER-99</text>

    <!-- Card 2: Manager -->
    <rect x="398" y="1140" width="268" height="44" rx="10" fill="#fff1f2" stroke="#fecdd3" />
    <text x="412" y="1160" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#9f1239">🛡️ Manager (Manajer Outlet)</text>
    <text x="412" y="1176" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#e11d48">PIN: 3333 · NFC-MANAGER-01</text>

    <!-- Card 3: Cashier -->
    <rect x="398" y="1190" width="268" height="44" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="412" y="1210" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#065f46">💳 Kasir (Budi Prasetyo)</text>
    <text x="412" y="1226" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#047857">PIN: 1111 · NFC-CASHIER-12</text>

    <!-- Card 4: Waiter -->
    <rect x="398" y="1240" width="268" height="44" rx="10" fill="#f0f9ff" stroke="#bae6fd" />
    <text x="412" y="1260" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#075985">🍽️ Waiter (Doni Setiawan)</text>
    <text x="412" y="1276" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="#0284c7">PIN: 5555 · NFC-WAITER-01</text>

    <!-- Card 5: Kitchen & Finance -->
    <rect x="398" y="1290" width="130" height="44" rx="10" fill="#fff7ed" stroke="#fed7aa" />
    <text x="408" y="1310" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#9a3412">👨‍🍳 Kitchen (6666)</text>
    <text x="408" y="1325" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" fill="#c2410c">NFC-KITCHEN-01</text>

    <rect x="536" y="1290" width="130" height="44" rx="10" fill="#eef2ff" stroke="#c7d2fe" />
    <text x="546" y="1310" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#312e81">📊 Finance (2222)</text>
    <text x="546" y="1325" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" fill="#4338ca">NFC-FINANCE-56</text>

    <!-- Auto-Fill Quick Action Footer -->
    <rect x="110" y="1388" width="572" height="108" rx="16" fill="#dde5f0" />
    <text x="130" y="1412" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#334155">QUICK AUTO-FILL CREDENTIALS TESTING (6 ROLE):</text>
    <rect x="130" y="1424" width="168" height="32" rx="8" fill="url(#clayAmber)" />
    <text x="214" y="1444" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">👑 Owner (4444)</text>
    <rect x="312" y="1424" width="168" height="32" rx="8" fill="url(#clayCrimson)" />
    <text x="396" y="1444" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">🛡️ Manager (3333)</text>
    <rect x="494" y="1424" width="168" height="32" rx="8" fill="url(#clayEmerald)" />
    <text x="578" y="1444" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">💳 Kasir (1111)</text>
    <rect x="130" y="1460" width="168" height="28" rx="8" fill="url(#clayDark)" />
    <text x="214" y="1478" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">🍽️ Waiter (5555)</text>
    <rect x="312" y="1460" width="168" height="28" rx="8" fill="url(#clayAmber)" />
    <text x="396" y="1478" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">👨‍🍳 Kitchen (6666)</text>
    <rect x="494" y="1460" width="168" height="28" rx="8" fill="url(#clayIndigo)" />
    <text x="578" y="1478" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">📊 Finance (2222)</text>
  </g>

  <!-- ARTBOARD 07: OWNER EXECUTIVE COCKPIT -->
  <g id="Frame_07_Owner_Executive_Cockpit">
    <text x="768" y="864" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">07 / EXECUTIVE COCKPIT &amp; KONTROL BISNIS (ROLE: OWNER)</text>
    <rect x="768" y="878" width="860" height="660" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Owner Header -->
    <rect x="784" y="896" width="828" height="68" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="800" y="910" width="40" height="40" rx="12" fill="url(#clayAmber)" />
    <text x="820" y="936" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">👑</text>
    <text x="852" y="930" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Executive Cockpit &amp; Pengawasan Bisnis Restoran</text>
    <text x="852" y="950" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#b45309">Owner Mode: Hendrawan Kusuma · Akses Penuh Superadmin</text>

    <rect x="1410" y="910" width="102" height="40" rx="12" fill="url(#clayEmerald)" />
    <text x="1461" y="935" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">Google Sheets</text>
    <rect x="1520" y="910" width="80" height="40" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="1560" y="935" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">Kunci Layar</text>

    <!-- Quick Switch Navigation Cards -->
    <rect x="784" y="976" width="404" height="74" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <rect x="800" y="990" width="46" height="46" rx="14" fill="url(#clayEmerald)" />
    <text x="823" y="1018" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">🏪</text>
    <text x="856" y="1008" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Buka Floor Plan Kasir</text>
    <text x="856" y="1026" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Pantau 36 Meja (${occupiedTables} Terisi / ${availableTables} Kosong) →</text>

    <rect x="1208" y="976" width="404" height="74" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <rect x="1224" y="990" width="46" height="46" rx="14" fill="url(#clayIndigo)" />
    <text x="1247" y="1018" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">📈</text>
    <text x="1280" y="1008" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Buka Pembukuan Finance</text>
    <text x="1280" y="1026" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Audit Pajak PB1, EDC &amp; Buku Kas Kecil →</text>

    <!-- 4 KPI Pillars -->
    <g id="Owner_KPI_Pillars">
      <rect x="784" y="1064" width="194" height="88" rx="16" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="800" y="1088" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#065f46">GROSS OMZET HARI INI</text>
      <text x="800" y="1116" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" fill="#064e3b">Rp 572.880</text>
      <text x="800" y="1136" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#047857">4 Meja Ditutup</text>

      <rect x="996" y="1064" width="194" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="1012" y="1088" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#64748b">LABA OPERASIONAL</text>
      <text x="1012" y="1116" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" fill="#059669">Rp 296.643</text>
      <text x="1012" y="1136" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#64748b">Margin Bersih ~52%</text>

      <rect x="1208" y="1064" width="194" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="1224" y="1088" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#64748b">OKUPANSI MEJA</text>
      <text x="1224" y="1116" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" fill="#0f172a">${occupiedTables} / ${totalTables}</text>
      <text x="1224" y="1136" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#059669">${availableTables} Meja Siap Pakai</text>

      <rect x="1420" y="1064" width="192" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="1436" y="1088" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#64748b">TOTAL ASET BOM</text>
      <text x="1436" y="1116" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" fill="#4338ca">Rp 8.027.000</text>
      <text x="1436" y="1136" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#64748b">14 Bahan Baku</text>
    </g>

    <!-- Critical BOM Stocks & Kitchen Operations Split -->
    <rect x="784" y="1166" width="404" height="348" rx="20" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <text x="804" y="1198" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Status Bahan Baku Kritis (Batas ROP)</text>

    <!-- Low stock card 1 -->
    <rect x="804" y="1214" width="364" height="72" rx="14" fill="#fff1f2" stroke="#fecdd3" />
    <text x="820" y="1240" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#9f1239">Beras Pandan Wangi Super</text>
    <text x="820" y="1260" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#e11d48">Sisa: 4 kg (Batas Minimum: 10 kg)</text>
    <rect x="1086" y="1228" width="34" height="34" rx="9" fill="#ffffff" stroke="#cbd5e1" />
    <text x="1103" y="1250" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="800" fill="#0f172a">+5</text>
    <rect x="1126" y="1228" width="34" height="34" rx="9" fill="url(#clayEmerald)" />
    <text x="1143" y="1250" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="800" fill="#ffffff">+10</text>

    <!-- Low stock card 2 -->
    <rect x="804" y="1296" width="364" height="72" rx="14" fill="#fff1f2" stroke="#fecdd3" />
    <text x="820" y="1322" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#9f1239">Minyak Goreng Sawit 2L</text>
    <text x="820" y="1342" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#e11d48">Sisa: 3 pch (Batas Minimum: 8 pch)</text>
    <rect x="1086" y="1310" width="34" height="34" rx="9" fill="#ffffff" stroke="#cbd5e1" />
    <text x="1103" y="1332" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="800" fill="#0f172a">+5</text>
    <rect x="1126" y="1310" width="34" height="34" rx="9" fill="url(#clayEmerald)" />
    <text x="1143" y="1332" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="800" fill="#ffffff">+10</text>

    <!-- Real-time Production Queue Split -->
    <rect x="1208" y="1166" width="404" height="348" rx="20" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <text x="1228" y="1198" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Antrean Produksi Dapur &amp; Barista (KDS)</text>

    <rect x="1228" y="1214" width="176" height="110" rx="16" fill="#fffbeb" stroke="#fde68a" />
    <text x="1244" y="1242" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#92400e">SEDANG DIMASAK</text>
    <text x="1244" y="1282" font-family="JetBrains Mono, monospace" font-size="28" font-weight="800" fill="#92400e">1 Menu</text>
    <text x="1244" y="1308" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#b45309">KDS Dapur &amp; Bar</text>

    <rect x="1418" y="1214" width="176" height="110" rx="16" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="1434" y="1242" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#065f46">SIAP DIANTAR</text>
    <text x="1434" y="1282" font-family="JetBrains Mono, monospace" font-size="28" font-weight="800" fill="#065f46">1 Menu</text>
    <text x="1434" y="1308" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#047857">Station Checker Waiter</text>

    <rect x="1228" y="1336" width="366" height="158" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="1244" y="1362" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">Siklus Otomatis RestoPOS:</text>
    <text x="1244" y="1388" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">1. Kasir input pesanan → 2. Tiket rute otomatis ke printer</text>
    <text x="1244" y="1412" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">3. KDS memasak &amp; oper ke waiter → 4. Waiter contreng</text>
    <text x="1244" y="1436" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">5. Pembayaran kasir memotong stok BOM &amp; catat PB1 10%</text>
  </g>

  <!-- ARTBOARD 08: FINANCE WORKSPACE & PB1 -->
  <g id="Frame_08_Finance_Workspace_PB1_And_Petty_Cash">
    <text x="1656" y="864" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">08 / WORKSPACE PEMBUKUAN, PAJAK PB1 &amp; KAS KECIL (ROLE: FINANCE)</text>
    <rect x="1656" y="878" width="1020" height="660" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Finance Header -->
    <rect x="1672" y="896" width="988" height="68" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="1688" y="910" width="40" height="40" rx="12" fill="url(#clayIndigo)" />
    <text x="1708" y="936" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">📊</text>
    <text x="1740" y="930" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Workspace Pembukuan &amp; Pajak Resto (PB1)</text>
    <text x="1740" y="950" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#4338ca">Peran: Finance (Ratna Dewi) · Audit Penerimaan &amp; Kas Kecil Operasional</text>

    <rect x="2490" y="910" width="154" height="40" rx="12" fill="url(#clayEmerald)" />
    <text x="2567" y="935" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">Ekspor Google Sheets</text>

    <!-- 6 Finance KPI Cards -->
    <g id="Finance_6_KPI_Cards">
      <rect x="1672" y="976" width="154" height="88" rx="16" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="1688" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#065f46">KAS DI LACI KASIR</text>
      <text x="1688" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#064e3b">Rp 80.500</text>
      <text x="1688" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#047857">Saldo Fisik Bersih</text>

      <rect x="1838" y="976" width="154" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="1854" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#64748b">TOTAL OMZET KOTOR</text>
      <text x="1854" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#0f172a">Rp 572.880</text>
      <text x="1854" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#64748b">4 Transaksi Lunas</text>

      <rect x="2004" y="976" width="154" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="2020" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#64748b">PAJAK RESTO PB1 (10%)</text>
      <text x="2020" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#0f172a">Rp 52.080</text>
      <text x="2020" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#64748b">Kasda Bapenda</text>

      <rect x="2170" y="976" width="154" height="88" rx="16" fill="#ffffff" stroke="#e2e8f0" />
      <text x="2186" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#64748b">SERVICE CHARGE (5%)</text>
      <text x="2186" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#4338ca">Rp 24.800</text>
      <text x="2186" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#64748b">Insentif Staf</text>

      <rect x="2336" y="976" width="154" height="88" rx="16" fill="#fff1f2" stroke="#fecdd3" />
      <text x="2352" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#9f1239">KAS KECIL KELUAR</text>
      <text x="2352" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#e11d48">Rp 70.000</text>
      <text x="2352" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#9f1239">2 Nota Belanja</text>

      <rect x="2502" y="976" width="158" height="88" rx="16" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="2518" y="1000" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#065f46">LABA OPERASIONAL</text>
      <text x="2518" y="1026" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" fill="#065f46">Rp 226.643</text>
      <text x="2518" y="1046" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#059669">Net Setelah Petty Cash</text>
    </g>

    <!-- Sub Navigation Tabs -->
    <rect x="1672" y="1076" width="988" height="44" rx="14" fill="#dde5f0" />
    <rect x="1676" y="1080" width="190" height="36" rx="11" fill="#ffffff" />
    <text x="1771" y="1103" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Audit Struk Omzet (4)</text>
    <rect x="1872" y="1080" width="190" height="36" rx="11" fill="#ffffff" />
    <text x="1967" y="1103" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Rekonsiliasi EDC &amp; QRIS</text>
    <rect x="2068" y="1080" width="190" height="36" rx="11" fill="url(#clayDark)" />
    <text x="2163" y="1103" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Buku Kas Kecil (2 Nota)</text>

    <!-- Petty Cash Ledger Left Form + Right Table -->
    <rect x="1672" y="1132" width="340" height="382" rx="20" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <text x="1692" y="1162" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">+ Catat Pengeluaran Kas Kecil</text>

    <text x="1692" y="1192" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">KETERANGAN BELANJA</text>
    <rect x="1692" y="1200" width="300" height="38" rx="10" fill="#f8fafc" stroke="#cbd5e1" />
    <text x="1706" y="1224" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#0f172a">Beli Daun Pisang &amp; Jeruk Nipis</text>

    <text x="1692" y="1258" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">NOMINAL (RP)</text>
    <rect x="1692" y="1266" width="300" height="38" rx="10" fill="#f8fafc" stroke="#cbd5e1" />
    <text x="1706" y="1290" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#0f172a">Rp 20.000</text>

    <rect x="1692" y="1454" width="300" height="44" rx="12" fill="url(#clayIndigo)" />
    <text x="1842" y="1480" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">SIMPAN PENGELUARAN KASIR</text>

    <!-- Petty Cash List Table -->
    <rect x="2024" y="1132" width="636" height="382" rx="20" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
    <rect x="2038" y="1146" width="608" height="36" rx="10" fill="#f1f5f9" />
    <text x="2054" y="1169" font-family="JetBrains Mono, monospace" font-size="10" font-weight="800" fill="#475569">WAKTU</text>
    <text x="2120" y="1169" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">KETERANGAN &amp; BON</text>
    <text x="2420" y="1169" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">KATEGORI</text>
    <text x="2610" y="1169" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" font-weight="800" fill="#475569">NOMINAL</text>

    <!-- Row 1 -->
    <rect x="2038" y="1190" width="608" height="64" rx="12" fill="#ffffff" stroke="#f1f5f9" />
    <text x="2054" y="1222" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">13:00</text>
    <text x="2120" y="1218" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">Isi Ulang Gas LPG 12kg Dapur</text>
    <text x="2120" y="1236" font-family="JetBrains Mono, monospace" font-size="9" fill="#64748b">Bon: B-8821 · Otorisasi: Ratna Dewi</text>
    <rect x="2420" y="1208" width="88" height="24" rx="6" fill="#f1f5f9" />
    <text x="2464" y="1224" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#475569">OPERASIONAL</text>
    <text x="2610" y="1228" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#e11d48">-Rp 45.000</text>

    <!-- Row 2 -->
    <rect x="2038" y="1262" width="608" height="64" rx="12" fill="#ffffff" stroke="#f1f5f9" />
    <text x="2054" y="1294" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">14:20</text>
    <text x="2120" y="1290" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">Es Kristal Balok Tambahan Bar Station</text>
    <text x="2120" y="1308" font-family="JetBrains Mono, monospace" font-size="9" fill="#64748b">Bon: B-8839 · Otorisasi: Ratna Dewi</text>
    <rect x="2420" y="1280" width="98" height="24" rx="6" fill="#f1f5f9" />
    <text x="2469" y="1296" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#475569">BAHAN DARURAT</text>
    <text x="2610" y="1300" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#e11d48">-Rp 25.000</text>
  </g>

  <!-- ARTBOARD 09: GOOGLE SHEETS, DRIVE & LOOKER STUDIO SYNC -->
  <g id="Frame_09_Google_Sheets_And_Drive_Sync">
    <text x="2700" y="864" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">09 / INTEGRASI REKAP OMZET GOOGLE SHEETS &amp; GOOGLE DATA STUDIO (LOOKER STUDIO)</text>
    <rect x="2700" y="878" width="956" height="660" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Sheets Modal Box -->
    <rect x="2724" y="896" width="908" height="622" rx="22" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />

    <!-- Header -->
    <rect x="2744" y="916" width="868" height="64" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2760" y="928" width="40" height="40" rx="12" fill="url(#clayEmerald)" />
    <text x="2780" y="953" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">📊</text>
    <text x="2814" y="946" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Integrasi Google Sheets &amp; Google Data Studio (Looker Studio)</text>
    <text x="2814" y="964" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#059669">Ekspor Real-time Rekap Omzet PB1 (Z-Report), CSV Looker Studio &amp; Inventaris BOM</text>

    <!-- Connected Account -->
    <rect x="2744" y="992" width="868" height="60" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <circle cx="2776" cy="1022" r="18" fill="#059669" />
    <text x="2776" y="1027" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">D</text>
    <text x="2806" y="1018" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Dripperize</text>
    <text x="2806" y="1034" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">Dripperize@gmail.com · OAuth Client Active</text>
    <rect x="3486" y="1006" width="110" height="32" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="3541" y="1026" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#065f46">TERHUBUNG ✓</text>

    <!-- 2 Spreadsheet Tabs Preview -->
    <rect x="2744" y="1064" width="424" height="230" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2760" y="1080" width="392" height="34" rx="10" fill="#ecfdf5" />
    <text x="2776" y="1102" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#065f46">TAB 1: REKAP PENJUALAN &amp; PAJAK PB1</text>
    <text x="2760" y="1140" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Kolom: No Meja, Bill ID, Waktu, Metode Bayar</text>
    <text x="2760" y="1164" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Subtotal, Service Charge 5%, Pajak PB1 10%</text>
    <text x="2760" y="1188" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Siap Diimpor ke Google Data Studio (Looker Studio)</text>
    <text x="2760" y="1212" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Rekonsiliasi Otomatis Harian (Z-Report)</text>

    <rect x="3188" y="1064" width="424" height="230" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="3204" y="1080" width="392" height="34" rx="10" fill="#eef2ff" />
    <text x="3220" y="1102" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#312e81">TAB 2: INVENTARIS STOK BAHAN BOM</text>
    <text x="3204" y="1140" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Kolom: ID Bahan, Nama Bahan, Zona Simpan</text>
    <text x="3204" y="1164" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Stok Terkini, Satuan, Batas Minimum ROP</text>
    <text x="3204" y="1188" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• HPP Satuan &amp; Total Nilai Valuasi Aset</text>
    <text x="3204" y="1212" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#334155">• Status Peringatan: Restock / Aman</text>

    <!-- Create Button CTA + Looker Studio Quick Actions -->
    <rect x="2744" y="1310" width="560" height="56" rx="16" fill="url(#clayEmerald)" />
    <text x="3024" y="1344" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">KONFIRMASI &amp; BUAT GOOGLE SPREADSHEET BARU</text>

    <rect x="3316" y="1310" width="296" height="56" rx="16" fill="url(#clayIndigo)" />
    <text x="3464" y="1344" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#ffffff">Unduh CSV (Google Data Studio)</text>

    <rect x="2744" y="1380" width="868" height="114" rx="16" fill="#dde5f0" />
    <text x="2764" y="1406" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#334155">HASIL GENERATE TAUTAN LANGSUNG SPREADSHEET &amp; LOOKER STUDIO:</text>
    <rect x="2764" y="1418" width="520" height="42" rx="10" fill="#ffffff" />
    <text x="2778" y="1444" font-family="JetBrains Mono, monospace" font-size="11" fill="#047857">https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUU.../edit</text>
    <rect x="3296" y="1418" width="140" height="42" rx="10" fill="url(#clayIndigo)" />
    <text x="3366" y="1444" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">Buka Sheets ↗</text>
    <rect x="3446" y="1418" width="166" height="42" rx="10" fill="url(#clayDark)" />
    <text x="3529" y="1444" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">Looker Studio ↗</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ROW 3: DESIGN SYSTEM TOKENS STRIP & STAFF ROLE CAPABILITIES MATRIX   -->
  <!-- ===================================================================== -->
  <g id="Claymorphism_Design_Tokens_Strip">
    <rect x="64" y="1570" width="3592" height="1060" rx="24" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" filter="url(#clayShadow)" />
    <text x="96" y="1614" font-family="Plus Jakarta Sans, sans-serif" font-size="20" font-weight="800" fill="#0f172a">Claymorphism Design System Tokens &amp; Multi-Role Capability Matrix</text>
    <text x="96" y="1638" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#64748b">Typography: Plus Jakarta Sans (Display/UI) + JetBrains Mono (Tabular Numerals) · Touch Target Minimum: 44px–48px · Dual Inner Highlight + Soft Drop Shadow</text>

    <!-- 6 Color Swatches -->
    <rect x="96" y="1666" width="260" height="140" rx="18" fill="#e8eef5" stroke="#cbd5e1" />
    <text x="116" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Clay Canvas</text>
    <text x="116" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#475569">#E8EEF5 · Surface</text>

    <rect x="376" y="1666" width="260" height="140" rx="18" fill="#dde5f0" stroke="#cbd5e1" />
    <text x="396" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Clay Recessed Well</text>
    <text x="396" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#475569">#DDE5F0 · Inset Track</text>

    <rect x="656" y="1666" width="260" height="140" rx="18" fill="url(#clayEmerald)" filter="url(#clayShadowSm)" />
    <text x="676" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">Hijau Pekat / CTA</text>
    <text x="676" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#ecfdf5">#059669 → #065F46</text>

    <rect x="936" y="1666" width="260" height="140" rx="18" fill="url(#clayCrimson)" filter="url(#clayShadowSm)" />
    <text x="956" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">Merah Terisi (Occupied)</text>
    <text x="956" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#ffe4e6">#E11D48 → #9F1239</text>

    <rect x="1216" y="1666" width="260" height="140" rx="18" fill="url(#clayAmber)" filter="url(#clayShadowSm)" />
    <text x="1236" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">Amber Owner Gold</text>
    <text x="1236" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#fffbeb">#D97706 → #B45309</text>

    <rect x="1496" y="1666" width="260" height="140" rx="18" fill="url(#clayIndigo)" filter="url(#clayShadowSm)" />
    <text x="1516" y="1760" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">Action Indigo</text>
    <text x="1516" y="1782" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#e0e7ff">#4338CA → #312E81</text>

    <!-- v2 Feature Callout 1: Staff Admin, PIN & Block Console (Owner) -->
    <g id="Frame_10_Staff_Admin_PIN_And_Block_Console">
      <rect x="1780" y="1666" width="880" height="140" rx="18" fill="#ffffff" stroke="#cbd5e1" filter="url(#clayShadowSm)" />
      <rect x="1796" y="1680" width="34" height="34" rx="10" fill="url(#clayAmber)" />
      <text x="1813" y="1702" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">⚙️</text>
      <text x="1840" y="1698" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Frame 10 / Admin &amp; Staff Console (Owner): Setting PIN &amp; Blokir Akun</text>
      <text x="1840" y="1716" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#b45309">Fitur v2.4: Tambah Karyawan Baru, Set/Reset PIN 4–8 Digit, Blokir &amp; Buka Blokir (suspended/active)</text>
      <rect x="1796" y="1730" width="260" height="60" rx="10" fill="#fffbeb" stroke="#fde68a" />
      <text x="1808" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#92400e">+ Tambah Karyawan Baru</text>
      <text x="1808" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#b45309">Nama, 6 Role, PIN 4-8 Digit</text>
      <rect x="2070" y="1730" width="280" height="60" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="2082" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#065f46">🔑 Ubah &amp; Reset PIN 4-8 Digit</text>
      <text x="2082" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#047857">Revoke Sesi Aktif + Audit Log</text>
      <rect x="2364" y="1730" width="280" height="60" rx="10" fill="#fff1f2" stroke="#fecdd3" />
      <text x="2376" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#9f1239">🚫 Blokir &amp; Buka Blokir Akun</text>
      <text x="2376" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#e11d48">Self-block &amp; Last Owner Guard</text>
    </g>

    <!-- v2 Feature Callout 2: Menu Stock Control & Cancellation Approval (Manager/Owner) -->
    <g id="Frame_11_Menu_Stock_And_Cancellation_Approval">
      <rect x="2680" y="1666" width="944" height="140" rx="18" fill="#ffffff" stroke="#cbd5e1" filter="url(#clayShadowSm)" />
      <rect x="2696" y="1680" width="34" height="34" rx="10" fill="url(#clayEmerald)" />
      <text x="2713" y="1702" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">📦</text>
      <text x="2740" y="1698" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">Frame 11 / Kontrol Stok Menu &amp; Void Approval (Manager/Owner)</text>
      <text x="2740" y="1716" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#047857">Reservasi Stok Real-time, Badge Stok Habis, Permintaan Void &amp; Approval Pengembalian Stok</text>
      <rect x="2696" y="1730" width="290" height="60" rx="10" fill="#f0fdf4" stroke="#bbf7d0" />
      <text x="2708" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#166534">📊 Reservasi Stok Menu Atomik</text>
      <text x="2708" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#15803d">Auto Stok Habis (Disable Input)</text>
      <rect x="3000" y="1730" width="300" height="60" rx="10" fill="#fffbeb" stroke="#fde68a" />
      <text x="3012" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#92400e">⚠️ Request Pembatalan (Reason)</text>
      <text x="3012" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#b45309">Kasir/Waiter Ajukan Void Menu</text>
      <rect x="3314" y="1730" width="294" height="60" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="3326" y="1752" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#065f46">✅ Approval Manager/Owner</text>
      <text x="3326" y="1772" font-family="JetBrains Mono, monospace" font-size="9" fill="#047857">Setujui Void &amp; Restore Stok</text>
    </g>

    <!-- Role Permissions Matrix Table (6 Roles) -->
    <rect x="96" y="1824" width="3528" height="376" rx="20" fill="#ffffff" stroke="#dce4ee" />
    <text x="126" y="1858" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Matriks Hak Akses &amp; Tampilan Khusus 6 Role Staff Resto</text>

    <!-- Table Header -->
    <rect x="126" y="1872" width="3468" height="38" rx="10" fill="#f1f5f9" />
    <text x="146" y="1896" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">PERAN STAFF</text>
    <text x="440" y="1896" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">KODE PIN / NFC (QA PRESETS)</text>
    <text x="780" y="1896" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">TAMPILAN KHUSUS UTAMA</text>
    <text x="1520" y="1896" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">HAK AKSES FITUR POS</text>
    <text x="2540" y="1896" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#475569">BATASAN &amp; PROTEKSI KEAMANAN</text>

    <!-- Row 1: Owner -->
    <text x="146" y="1932" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#b45309">👑 OWNER (Hendrawan)</text>
    <text x="440" y="1932" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 4444 · NFC-OWNER-99</text>
    <text x="780" y="1932" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">Cockpit Eksekutif, Admin Karyawan (Set PIN &amp; Blokir), Okupansi Meja, Analisis Laba</text>
    <text x="1520" y="1932" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Akses Penuh: Admin Staff, Floor Plan, KDS, Checker, Stok Menu, Kas Kecil, Reset Demo &amp; Google Sheets</text>
    <text x="2540" y="1932" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#059669">Superadmin: Akses tanpa batasan, perlindungan self-block &amp; last owner</text>
    <line x1="126" y1="1946" x2="3594" y2="1946" stroke="#f1f5f9" stroke-width="1.5" />

    <!-- Row 2: Manager -->
    <text x="146" y="1974" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#9f1239">🛡️ MANAGER (Manajer Outlet)</text>
    <text x="440" y="1974" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 3333 · NFC-MANAGER-01</text>
    <text x="780" y="1974" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">Floor Plan, Void Approval Item, Kontrol Stok Menu &amp; Rekap Penjualan Shift</text>
    <text x="1520" y="1974" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Operasi Meja, Approval Pembatalan Item (Restore Stok), KDS Dapur, Checker, Laporan Shift</text>
    <text x="2540" y="1974" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#047857">Otorisasi Shift: Dapat membatalkan item aktif, tidak dapat modifikasi konfigurasi tenant</text>
    <line x1="126" y1="1988" x2="3594" y2="1988" stroke="#f1f5f9" stroke-width="1.5" />

    <!-- Row 3: Cashier -->
    <text x="146" y="2016" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#047857">💳 KASIR (Budi Prasetyo)</text>
    <text x="440" y="2016" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 1111 · NFC-CASHIER-12</text>
    <text x="780" y="2016" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">Floor Plan 36 Meja, Checkout Cepat, Dual Mode Bayar, Cetak Struk Sah &amp; Rekap Omzet</text>
    <text x="1520" y="2016" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Buka Meja, Input Menu &amp; Modifier, Settlement Lunas, Rekap PB1, KDS Dapur, Checker</text>
    <text x="2540" y="2016" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#e11d48">Terbatas: Dilarang ubah tarif PB1/Service; void menu harus melalui approval Manager/Owner</text>
    <line x1="126" y1="2030" x2="3594" y2="2030" stroke="#f1f5f9" stroke-width="1.5" />

    <!-- Row 4: Waiter -->
    <text x="146" y="2058" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0369a1">🍽️ WAITER (Doni Setiawan)</text>
    <text x="440" y="2058" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 5555 · NFC-WAITER-01</text>
    <text x="780" y="2058" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">Checker Waiter (Pencontrengan Meja) &amp; Floor Plan Monitoring Tamu</text>
    <text x="1520" y="2058" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Input Tambah Order Meja, Contreng Sajian Siap Antar, Pantau Durasi Meja</text>
    <text x="2540" y="2058" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0284c7">Layanan Meja: Tidak memiliki akses tutup meja lunas / pembayaran atau kas kecil</text>
    <line x1="126" y1="2072" x2="3594" y2="2072" stroke="#f1f5f9" stroke-width="1.5" />

    <!-- Row 5: Kitchen -->
    <text x="146" y="2100" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#c2410c">👨‍🍳 KITCHEN (Chef Dapur)</text>
    <text x="440" y="2100" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 6666 · NFC-KITCHEN-01</text>
    <text x="780" y="2100" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">KDS Dapur Live Station (Cooking Status: Antrean, Dimasak, Matang, Oper ke Waiter)</text>
    <text x="1520" y="2100" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Update Status Sajian Dapur/Bar, Bump Order Matang, Operasi Antrean Masak</text>
    <text x="2540" y="2100" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#ea580c">Dapur Khusus: Hanya dapat mengakses KDS station dapur/bar, tanpa akses tagihan</text>
    <line x1="126" y1="2114" x2="3594" y2="2114" stroke="#f1f5f9" stroke-width="1.5" />

    <!-- Row 6: Finance -->
    <text x="146" y="2142" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#4338ca">📊 FINANCE (Ratna Dewi)</text>
    <text x="440" y="2142" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">PIN: 2222 · NFC-FINANCE-56</text>
    <text x="780" y="2142" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#0f172a">Workspace Pembukuan, Rekonsiliasi EDC/QRIS, Buku Kas Kecil &amp; PB1, Ekspor Google Sheets/DS</text>
    <text x="1520" y="2142" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#334155">Audit Struk Omzet, Form Catat Kas Kecil, Saldo Kas Laci Fisik, Ekspor Google Sheets &amp; Google DS</text>
    <text x="2540" y="2142" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#4338ca">Fokus Akuntansi: Tab operasional pesanan kasir (Floor Plan/KDS) tidak ditampilkan</text>

    <!-- Detailed Flow Specification -->
    <rect x="96" y="2216" width="3528" height="388" rx="20" fill="#ffffff" stroke="#dce4ee" />
    <text x="126" y="2234" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Alur End-to-End Operasional RestoPOS (Dual Payment Mode, Handoff KDS &amp; Audit PB1)</text>

    <text x="126" y="2274" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">1. OTORISASI MULTI-ROLE: Staff menempelkan kartu badge NFC fisik atau menginput 4-digit PIN pada keypad layar sentuh.</text>
    <text x="126" y="2304" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Layar otomatis menyesuaikan peran: Owner membuka Cockpit Eksekutif, Kasir membuka Floor Plan, Finance membuka Buku Kas &amp; PB1.</text>
    <text x="126" y="2340" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">2. OPERASIONAL PESANAN KASIR (DUAL PAYMENT MODE):</text>
    <text x="126" y="2370" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Mode Payment Last (Bayar Belakang): Kasir/Pramusaji kirim pesanan → Tiket rute otomatis ke Printer Dapur, Bar, dan Checker Waiter.</text>
    <text x="126" y="2400" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Mode Payment First (Langsung Bayar di Depan): Kasir selesaikan pembayaran langsung saat pesan → Cetak Struk Pembayaran Sah + Tiket Dapur/Bar/Checker bersamaan.</text>
    <text x="126" y="2436" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">3. KDS LIVE STATION &amp; OPER KE WAITER:</text>
    <text x="126" y="2466" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Koki/Barista klik "Matang · Oper ke Waiter" → Tiket KDS otomatis hilang dari layar dapur dan masuk ke antrean "Siap Antar" di Checker Waiter.</text>
    <text x="126" y="2502" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">4. CHECKER WAITER &amp; SETTLEMENT MEJA:</text>
    <text x="126" y="2532" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Waiter mencontreng sajian di meja hingga 100% lengkap → Kasir menutup meja dengan kalkulasi Pajak PB1 10% dan Service 5%.</text>
    <text x="126" y="2568" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">5. SINKRONISASI CLOUD GOOGLE SHEETS &amp; BUKU KAS KECIL:</text>
    <text x="126" y="2598" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">   • Pembukuan Finance mencatat pengeluaran kas kecil laci kasir dan otomatis menyinkronkan seluruh omzet &amp; stok BOM ke Google Spreadsheet.</text>
  </g>
</svg>`;
}

/**
 * Triggers a clean client-side download of the Figma SVG wireframe file
 * without using window.open or window.alert (safe inside sandboxed iframes).
 */
export function downloadFigmaWireframe(
  options: FigmaWireframeOptions = {},
  filename = 'RestoPOS-Claymorphism-Figma-Wireframe.svg'
): string {
  const svgContent = generateFigmaWireframeSvg(options);

  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
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

  return filename;
}
