import { PaymentFlowMode } from '../types/pos';

export interface FigmaWireframeOptions {
  restaurantName?: string;
  totalTables?: number;
  availableTables?: number;
  occupiedTables?: number;
  paymentFlowMode?: PaymentFlowMode;
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
 * Generates a Figma-ready multi-artboard SVG wireframe & Claymorphism UI kit.
 * Dropping this .svg file into Figma creates editable vector Frames, Groups,
 * Claymorphism cards, rounded controls, and text layers.
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

  // Generate 12 mini table cards (4 cols x 3 rows) inside Artboard 01
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
<svg width="3720" height="1180" viewBox="0 0 3720 1180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>RestoPOS Touch — Claymorphism Figma Wireframe Kit</title>
  <desc>Editable multi-screen Claymorphism POS wireframe for Figma: Floor Plan, Order &amp; Payment Mode, KDS Live Handoff, Waiter Checker, and Settlement PB1.</desc>

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
  <rect id="Figma_Sheet_Background" x="0" y="0" width="3720" height="1180" fill="#dde5f0" />

  <!-- Sheet Header Banner -->
  <g id="Header_Specification_Banner">
    <rect x="64" y="32" width="3592" height="86" rx="22" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" filter="url(#clayShadow)" />
    <rect x="88" y="51" width="48" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="112" y="81" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="800" fill="#ffffff">RP</text>
    <text x="154" y="70" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800" fill="#0f172a">RestoPOS Touch — Claymorphism UI &amp; Figma Wireframe Blueprint</text>
    <text x="154" y="94" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#475569">Outlet: ${restaurantName} · ${totalTables} Meja (${availableTables} Kosong / ${occupiedTables} Terisi) · Mode Aktif: ${escapeXml(modeLabel)} · Drag &amp; Drop file .svg ini langsung ke Figma</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ARTBOARD 01: FLOOR PLAN (36 MEJA CLAYMORPHISM)                        -->
  <!-- ===================================================================== -->
  <g id="Frame_01_Floor_Plan_Claymorphism">
    <text x="64" y="158" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">01 / FLOOR PLAN &amp; TOP BAR (1440x900 CLAYMORPHISM)</text>
    <rect x="64" y="172" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Clay Top Navbar -->
    <rect x="80" y="188" width="632" height="56" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="94" y="200" width="32" height="32" rx="10" fill="url(#clayEmerald)" />
    <text x="134" y="221" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">RestoPOS</text>

    <!-- Nav Well -->
    <rect x="212" y="196" width="348" height="40" rx="13" fill="#dde5f0" />
    <rect x="217" y="200" width="76" height="32" rx="10" fill="url(#clayDark)" />
    <text x="255" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#ffffff">Floor Plan</text>
    <text x="328" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">KDS Dapur</text>
    <text x="392" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Checker</text>
    <text x="454" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">BOM Stok</text>
    <text x="520" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Omzet PB1</text>

    <!-- Figma Download CTA in Topbar -->
    <rect x="572" y="198" width="126" height="36" rx="11" fill="url(#clayIndigo)" />
    <text x="635" y="220" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Figma Wireframe</text>

    <!-- Filter Clay Panel -->
    <rect x="84" y="258" width="624" height="118" rx="20" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="104" y="284" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">ZONA MEJA &amp; FILTER STATUS</text>
    <rect x="104" y="296" width="84" height="36" rx="12" fill="url(#clayDark)" />
    <text x="146" y="318" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Semua (${totalTables})</text>
    <rect x="196" y="296" width="82" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="237" y="318" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">Indoor (18)</text>
    <rect x="286" y="296" width="86" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="329" y="318" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">Outdoor (12)</text>
    <rect x="380" y="296" width="68" height="36" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="414" y="318" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#334155">VIP (6)</text>

    <!-- Search Well -->
    <rect x="466" y="296" width="222" height="36" rx="12" fill="#dde5f0" />
    <text x="484" y="318" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Cari nomor meja...</text>
    <text x="104" y="358" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#059669">${availableTables} Meja Hijau Pekat (Kosong)</text>
    <text x="312" y="358" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#e11d48">${occupiedTables} Meja Merah (Terisi / Lunas)</text>

    <!-- 12 Table Clay Cards Grid -->
    ${miniTablesMarkup}
  </g>

  <!-- ===================================================================== -->
  <!-- ARTBOARD 02: ORDER MODAL (PAYMENT LAST & PAYMENT FIRST)               -->
  <!-- ===================================================================== -->
  <g id="Frame_02_Order_Input_And_Payment_Mode">
    <text x="768" y="158" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">02 / INPUT PESANAN &amp; AKTIVASI MODE BAYAR (FIRST vs LAST)</text>
    <rect x="768" y="172" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Modal Top Clay Bar with Mode Switcher -->
    <rect x="784" y="188" width="632" height="68" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="804" y="216" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="800" fill="#0f172a">Buka Meja #02 · Input Pesanan</text>
    <text x="804" y="238" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#64748b">Pilih Kategori Resto: Payment Last (Open Bill) / Payment First (Kasir)</text>

    <!-- Mode Toggle Well -->
    <rect x="1142" y="198" width="258" height="46" rx="14" fill="#dde5f0" />
    <rect x="1147" y="203" width="122" height="36" rx="11" fill="${activeMode === 'payment_last' ? 'url(#clayDark)' : '#ffffff'}" />
    <text x="1208" y="225" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="${activeMode === 'payment_last' ? '#ffffff' : '#475569'}">Bayar Belakang</text>
    <rect x="1273" y="203" width="122" height="36" rx="11" fill="${activeMode === 'payment_first' ? 'url(#clayEmerald)' : '#ffffff'}" />
    <text x="1334" y="225" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="${activeMode === 'payment_first' ? '#ffffff' : '#475569'}">Bayar Langsung</text>

    <!-- Left Menu Column -->
    <rect x="784" y="270" width="382" height="516" rx="22" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="800" y="286" width="350" height="42" rx="13" fill="#dde5f0" />
    <rect x="805" y="291" width="92" height="32" rx="10" fill="url(#clayDark)" />
    <text x="851" y="311" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Semua Menu</text>
    <text x="952" y="311" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Dapur</text>
    <text x="1028" y="311" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Bar</text>
    <text x="1102" y="311" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#475569">Snack</text>

    <!-- 4 Menu Clay Cards -->
    <g id="Menu_Cards_Grid">
      <rect x="800" y="344" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="814" y="366" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#b45309">DAPUR · STOK 50</text>
      <text x="814" y="388" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Nasi Goreng Spesial</text>
      <text x="814" y="454" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 38.000</text>
      <rect x="900" y="434" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="928" y="453" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>

      <rect x="982" y="344" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="996" y="366" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#b45309">DAPUR · STOK 35</text>
      <text x="996" y="388" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Ayam Bakar Madu</text>
      <text x="996" y="454" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 42.000</text>
      <rect x="1082" y="434" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="1110" y="453" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>

      <rect x="800" y="490" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="814" y="512" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#0369a1">BAR · STOK 80</text>
      <text x="814" y="534" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Kopi Susu Aren</text>
      <text x="814" y="600" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 24.000</text>
      <rect x="900" y="580" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="928" y="599" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>

      <rect x="982" y="490" width="168" height="132" rx="18" fill="#ffffff" stroke="#e2e8f0" filter="url(#clayShadowSm)" />
      <text x="996" y="512" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#047857">SNACK · STOK 45</text>
      <text x="996" y="534" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Tahu Cabe Garam</text>
      <text x="996" y="600" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#047857">Rp 20.000</text>
      <rect x="1082" y="580" width="56" height="30" rx="10" fill="url(#clayEmerald)" />
      <text x="1110" y="599" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">+ Pilih</text>
    </g>

    <!-- Modifier Quick Bar -->
    <rect x="800" y="638" width="350" height="130" rx="16" fill="#dde5f0" />
    <text x="816" y="662" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#334155">CATATAN &amp; MODIFIER PESANAN</text>
    <rect x="816" y="674" width="98" height="28" rx="9" fill="#ffffff" />
    <text x="865" y="692" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#0f172a">Pedas Sedang</text>
    <rect x="922" y="674" width="88" height="28" rx="9" fill="#ffffff" />
    <text x="966" y="692" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#0f172a">Tanpa Es</text>
    <rect x="816" y="712" width="318" height="42" rx="12" fill="#ffffff" stroke="#cbd5e1" />
    <text x="830" y="737" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Catatan: Acar dipisah, sambal ekstra...</text>

    <!-- Right Order Cart Clay Panel -->
    <rect x="1180" y="270" width="236" height="516" rx="22" fill="#f8fafc" stroke="#dce4ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <text x="1198" y="300" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Pesanan Meja 02</text>
    <text x="1198" y="318" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#047857">BATCH #1 · 2 MENU</text>

    <rect x="1196" y="332" width="204" height="250" rx="16" fill="#dde5f0" />
    <rect x="1206" y="344" width="184" height="64" rx="12" fill="#ffffff" />
    <text x="1218" y="366" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">2x Nasi Goreng Spesial</text>
    <text x="1218" y="384" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="600" fill="#64748b">Pedas Sedang · Rp 76.000</text>
    <rect x="1206" y="418" width="184" height="64" rx="12" fill="#ffffff" />
    <text x="1218" y="440" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#0f172a">2x Kopi Susu Aren</text>
    <text x="1218" y="458" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="600" fill="#64748b">Less Sugar · Rp 48.000</text>

    <text x="1198" y="612" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">Subtotal</text>
    <text x="1398" y="612" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">Rp 124.000</text>
    <text x="1198" y="632" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569">Service 5% + PB1 10%</text>
    <text x="1398" y="632" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">Rp 19.220</text>
    <text x="1198" y="662" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">Total Estimasi</text>
    <text x="1398" y="662" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#047857">Rp 143.220</text>

    <rect x="1196" y="684" width="204" height="44" rx="13" fill="url(#clayEmerald)" />
    <text x="1298" y="710" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">KIRIM &amp; CETak DAPUR / BAR</text>
    <rect x="1196" y="736" width="204" height="36" rx="11" fill="url(#clayIndigo)" />
    <text x="1298" y="758" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">ATAU BAYAR LANGSUNG + STRUK</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ARTBOARD 03: KDS LIVE STATION & OPER KE WAITER                        -->
  <!-- ===================================================================== -->
  <g id="Frame_03_KDS_Dapur_Bar_Handoff">
    <text x="1472" y="158" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">03 / KDS LIVE STATION (AUTO-HIDE &amp; OPER KE WAITER)</text>
    <rect x="1472" y="172" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Clay Header -->
    <rect x="1488" y="188" width="632" height="58" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="1504" y="200" width="34" height="34" rx="11" fill="url(#clayAmber)" />
    <text x="1550" y="222" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">KDS Live Station (Dapur &amp; Bar)</text>
    <rect x="1956" y="199" width="148" height="36" rx="11" fill="url(#clayEmerald)" />
    <text x="2030" y="221" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Checker · 1 Siap Antar</text>

    <!-- Sub Filter Clay Panel -->
    <rect x="1488" y="258" width="632" height="54" rx="16" fill="#f8fafc" stroke="#dce4ee" />
    <rect x="1502" y="267" width="290" height="36" rx="11" fill="#dde5f0" />
    <rect x="1506" y="271" width="144" height="28" rx="9" fill="url(#clayDark)" />
    <text x="1578" y="289" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">Antrean Masak Aktif (2)</text>
    <text x="1720" y="289" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="700" fill="#475569">Sudah Dioper Waiter</text>

    <!-- Handoff Notification Strip -->
    <rect x="1488" y="324" width="632" height="44" rx="14" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="1508" y="350" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="700" fill="#065f46">✓ Menu selesai dimasak otomatis hilang dari KDS &amp; masuk antrean Siap Antar Waiter!</text>

    <!-- KDS Ticket Card 1 (Ready to Handoff) -->
    <rect x="1488" y="382" width="306" height="398" rx="22" fill="#ffffff" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <rect x="1500" y="394" width="282" height="48" rx="14" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="1516" y="423" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#065f46">Meja #05 · 35m</text>
    <text x="1766" y="423" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#047857">MATANG SIAP OPER</text>

    <rect x="1504" y="456" width="274" height="84" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="1518" y="480" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">1x Tahu Cabe Garam Crispy</text>
    <text x="1518" y="498" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#b45309">Catatan: Goreng garing</text>
    <rect x="1518" y="506" width="136" height="26" rx="8" fill="url(#clayEmerald)" />
    <text x="1586" y="523" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">Oper ke Waiter →</text>

    <rect x="1504" y="714" width="274" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="1641" y="742" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">SELESAI &amp; OPER MEJA #05</text>

    <!-- KDS Ticket Card 2 (Cooking) -->
    <rect x="1814" y="382" width="306" height="398" rx="22" fill="#ffffff" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <rect x="1826" y="394" width="282" height="48" rx="14" fill="#fffbeb" stroke="#fde68a" />
    <text x="1842" y="423" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" fill="#92400e">Meja #21 · 20m</text>
    <text x="2092" y="423" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#b45309">SEDANG DIMASAK</text>

    <rect x="1830" y="456" width="274" height="84" rx="14" fill="#f8fafc" stroke="#e2e8f0" />
    <text x="1844" y="480" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#0f172a">2x Sate Ayam Madura</text>
    <text x="1844" y="498" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#64748b">Bumbu kacang kental</text>
    <rect x="1844" y="506" width="152" height="26" rx="8" fill="url(#clayAmber)" />
    <text x="1920" y="523" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-weight="800" fill="#ffffff">Dimasak · Tandai Matang</text>

    <rect x="1830" y="714" width="274" height="48" rx="14" fill="url(#clayIndigo)" />
    <text x="1967" y="742" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">SELESAI &amp; OPER MEJA #21</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ARTBOARD 04: CHECKER WAITER (PENCONTRENGAN SAJIAN)                    -->
  <!-- ===================================================================== -->
  <g id="Frame_04_Checker_Waiter_Pencontrengan">
    <text x="2176" y="158" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">04 / CHECKER WAITER (PENCONTRENGAN &amp; OPERAN KDS)</text>
    <rect x="2176" y="172" width="664" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Clay Header -->
    <rect x="2192" y="188" width="632" height="58" rx="18" fill="#f8fafc" stroke="#d8e2ee" stroke-width="1.5" filter="url(#clayShadowSm)" />
    <rect x="2208" y="200" width="34" height="34" rx="11" fill="url(#clayEmerald)" />
    <text x="2254" y="222" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Checker Waiter (Pencontrengan Meja)</text>

    <!-- Occupied Tables Selector Well -->
    <rect x="2192" y="258" width="632" height="56" rx="16" fill="#f8fafc" stroke="#dce4ee" />
    <rect x="2208" y="268" width="154" height="36" rx="11" fill="url(#clayDark)" />
    <text x="2285" y="290" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="800" fill="#ffffff">Meja #05 · 1 Siap Antar!</text>
    <rect x="2372" y="268" width="128" height="36" rx="11" fill="#ffffff" stroke="#cbd5e1" />
    <text x="2436" y="290" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#334155">Meja #09 (Lengkap)</text>
    <rect x="2510" y="268" width="128" height="36" rx="11" fill="#ffffff" stroke="#cbd5e1" />
    <text x="2574" y="290" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#334155">Meja #21 (1/2)</text>

    <!-- Main Checklist Clay Panel -->
    <rect x="2192" y="328" width="632" height="456" rx="22" fill="#f8fafc" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <text x="2216" y="362" font-family="JetBrains Mono, monospace" font-size="16" font-weight="800" fill="#0f172a">Meja #05 · Zona Indoor · 3 Tamu</text>
    <text x="2800" y="362" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#059669">Progres: 2/3 Menu (67%)</text>
    <rect x="2216" y="376" width="584" height="12" rx="6" fill="#dde5f0" />
    <rect x="2216" y="376" width="390" height="12" rx="6" fill="url(#clayEmerald)" />

    <!-- Checklist Rows -->
    <rect x="2216" y="408" width="584" height="72" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2232" y="426" width="36" height="36" rx="10" fill="url(#clayEmerald)" />
    <text x="2250" y="450" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#ffffff">✓</text>
    <text x="2284" y="442" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-decoration="line-through">2x Nasi Goreng Spesial Resto</text>
    <text x="2284" y="460" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#059669">Sudah Tersaji di Meja</text>

    <rect x="2216" y="492" width="584" height="72" rx="16" fill="#ffffff" stroke="#e2e8f0" />
    <rect x="2232" y="510" width="36" height="36" rx="10" fill="url(#clayEmerald)" />
    <text x="2250" y="534" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#ffffff">✓</text>
    <text x="2284" y="526" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700" fill="#64748b" text-decoration="line-through">3x Es Teh Manis Jasmine</text>
    <text x="2284" y="544" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#059669">Sudah Tersaji di Meja</text>

    <rect x="2216" y="576" width="584" height="82" rx="16" fill="#ecfdf5" stroke="#34d399" stroke-width="1.5" />
    <rect x="2232" y="598" width="36" height="36" rx="10" fill="#ffffff" stroke="#059669" stroke-width="2" />
    <text x="2284" y="610" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#0f172a">1x Tahu Cabe Garam Crispy</text>
    <text x="2284" y="630" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#047857">SIAP DIANTAR (Dioper dari KDS Dapur)</text>
    <rect x="2644" y="598" width="140" height="38" rx="11" fill="url(#clayEmerald)" />
    <text x="2714" y="621" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#ffffff">Antar &amp; Contreng</text>

    <!-- Bottom Action Bar -->
    <rect x="2216" y="716" width="260" height="48" rx="14" fill="#ffffff" stroke="#cbd5e1" />
    <text x="2346" y="744" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#1e293b">Lihat Struk Checker</text>
    <rect x="2492" y="716" width="308" height="48" rx="14" fill="url(#clayEmerald)" />
    <text x="2646" y="744" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="800" fill="#ffffff">CONTRENG SEMUA TERSAJI ✓</text>
  </g>

  <!-- ===================================================================== -->
  <!-- ARTBOARD 05: PEMBAYARAN KASIR, PAJAK PB1 10% & STRUK SAH              -->
  <!-- ===================================================================== -->
  <g id="Frame_05_Settlement_PB1_And_Thermal_Receipt">
    <text x="2880" y="158" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" fill="#334155">05 / SETTLEMENT KASIR, PAJAK PB1 10% &amp; AUTO-ROUTING STRUK</text>
    <rect x="2880" y="172" width="776" height="630" rx="26" fill="#e8eef5" stroke="#cbd5e1" stroke-width="2" filter="url(#clayShadow)" />

    <!-- Left Settlement Controls -->
    <rect x="2898" y="190" width="448" height="594" rx="22" fill="#f8fafc" stroke="#dce4ee" filter="url(#clayShadowSm)" />
    <text x="2920" y="224" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="800" fill="#0f172a">Pembayaran &amp; Tutup Meja #05</text>
    <text x="2920" y="244" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#64748b">Pilih Metode Pembayaran &amp; Diskon Promo</text>

    <!-- Payment Method Clay Buttons -->
    <rect x="2920" y="264" width="130" height="56" rx="16" fill="url(#clayEmerald)" />
    <text x="2985" y="297" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#ffffff">TUNAI (CASH)</text>
    <rect x="3060" y="264" width="130" height="56" rx="16" fill="#ffffff" stroke="#cbd5e1" />
    <text x="3125" y="297" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#1e293b">QRIS DINAMIS</text>
    <rect x="3200" y="264" width="124" height="56" rx="16" fill="#ffffff" stroke="#cbd5e1" />
    <text x="3262" y="297" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="800" fill="#1e293b">DEBIT / KARTU</text>

    <!-- Cash Tender Well -->
    <rect x="2920" y="338" width="404" height="114" rx="18" fill="#dde5f0" />
    <text x="2940" y="364" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="800" fill="#475569">UANG DITERIMA DARI PELANGGAN</text>
    <rect x="2940" y="376" width="364" height="58" rx="14" fill="#ffffff" stroke="#059669" stroke-width="1.5" />
    <text x="2960" y="412" font-family="JetBrains Mono, monospace" font-size="22" font-weight="800" fill="#0f172a">Rp 150.000</text>
    <text x="3286" y="411" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#059669">Kembali: Rp 7.935</text>

    <!-- Tax & PB1 Summary Card -->
    <rect x="2920" y="470" width="404" height="214" rx="18" fill="#ffffff" stroke="#e2e8f0" />
    <text x="2942" y="502" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Subtotal Pesanan</text>
    <text x="3302" y="502" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 123.000</text>
    <text x="2942" y="532" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Service Charge (5%)</text>
    <text x="3302" y="532" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 6.150</text>
    <text x="2942" y="562" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="#475569">Pajak Restoran PB1 (10%)</text>
    <text x="3302" y="562" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#0f172a">Rp 12.915</text>
    <line x1="2942" y1="584" x2="3302" y2="584" stroke="#e2e8f0" stroke-width="1.5" />
    <text x="2942" y="618" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="800" fill="#0f172a">GRAND TOTAL</text>
    <text x="3302" y="618" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800" fill="#047857">Rp 142.065</text>
    <text x="2942" y="654" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#059669">✓ Stok BOM Terpotong · Omzet Tercatat · Meja Kembali Hijau</text>

    <rect x="2920" y="704" width="404" height="58" rx="16" fill="url(#clayEmerald)" />
    <text x="3122" y="738" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="800" fill="#ffffff">BAYAR LUNAS &amp; CETAK STRUK SAH</text>

    <!-- Right Thermal Receipt Preview -->
    <rect x="3364" y="190" width="274" height="594" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-dasharray="6 4" filter="url(#clayShadowSm)" />
    <text x="3501" y="228" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" font-weight="800" fill="#0f172a">RESTO NUSANTARA</text>
    <text x="3501" y="246" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600" fill="#64748b">STRUK PEMBAYARAN SAH</text>
    <line x1="3384" y1="264" x2="3618" y2="264" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="288" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Meja: #05 (Indoor)</text>
    <text x="3384" y="306" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Kasir: Budi Prasetyo</text>
    <line x1="3384" y1="322" x2="3618" y2="322" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="348" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">2x Nasi Goreng Spesial</text>
    <text x="3618" y="366" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 76.000</text>
    <text x="3384" y="392" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">3x Es Teh Jasmine</text>
    <text x="3618" y="410" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 27.000</text>
    <text x="3384" y="436" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#0f172a">1x Tahu Cabe Garam</text>
    <text x="3618" y="454" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Rp 20.000</text>
    <line x1="3384" y1="476" x2="3618" y2="476" stroke="#94a3b8" stroke-dasharray="4 3" />
    <text x="3384" y="502" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Subtotal      Rp 123.000</text>
    <text x="3384" y="522" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">Service 5%     Rp  6.150</text>
    <text x="3384" y="542" font-family="JetBrains Mono, monospace" font-size="10" fill="#334155">PB1 10%       Rp 12.915</text>
    <line x1="3384" y1="560" x2="3618" y2="560" stroke="#0f172a" />
    <text x="3384" y="586" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="#0f172a">TOTAL         Rp 142.065</text>
    <text x="3384" y="612" font-family="JetBrains Mono, monospace" font-size="10" fill="#047857">TUNAI         Rp 150.000</text>
    <text x="3384" y="632" font-family="JetBrains Mono, monospace" font-size="10" fill="#047857">KEMBALI        Rp  7.935</text>
    <rect x="3388" y="676" width="226" height="40" rx="10" fill="#ecfdf5" stroke="#a7f3d0" />
    <text x="3501" y="701" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" font-weight="800" fill="#065f46">STATUS: LUNAS SAH ✓</text>
  </g>

  <!-- ===================================================================== -->
  <!-- DESIGN SYSTEM TOKENS STRIP (CLAYMORPHISM PALETTE & TYPOGRAPHY)        -->
  <!-- ===================================================================== -->
  <g id="Claymorphism_Design_Tokens_Strip">
    <rect x="64" y="842" width="3592" height="296" rx="24" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" filter="url(#clayShadow)" />
    <text x="96" y="886" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="800" fill="#0f172a">Claymorphism Design System Tokens &amp; POS End-to-End Flow</text>
    <text x="96" y="910" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#64748b">Typography: Plus Jakarta Sans (Display/UI) + JetBrains Mono (Tabular Numerals) · Touch Target Minimum: 44px–48px · Dual Inner Highlight + Soft Drop Shadow</text>

    <!-- Swatch 1 -->
    <rect x="96" y="938" width="260" height="164" rx="20" fill="#e8eef5" stroke="#cbd5e1" />
    <text x="120" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Clay Canvas</text>
    <text x="120" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#475569">#E8EEF5 · Surface Base</text>

    <!-- Swatch 2 -->
    <rect x="380" y="938" width="260" height="164" rx="20" fill="#dde5f0" stroke="#cbd5e1" />
    <text x="404" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#0f172a">Clay Recessed Well</text>
    <text x="404" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#475569">#DDE5F0 · Inset Track</text>

    <!-- Swatch 3 -->
    <rect x="664" y="938" width="280" height="164" rx="20" fill="url(#clayEmerald)" filter="url(#clayShadowSm)" />
    <text x="688" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">Hijau Pekat (Available / CTA)</text>
    <text x="688" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#ecfdf5">#059669 → #065F46</text>

    <!-- Swatch 4 -->
    <rect x="968" y="938" width="280" height="164" rx="20" fill="url(#clayCrimson)" filter="url(#clayShadowSm)" />
    <text x="992" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">Merah Terisi (Occupied)</text>
    <text x="992" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#ffe4e6">#E11D48 → #9F1239</text>

    <!-- Swatch 5 -->
    <rect x="1272" y="938" width="280" height="164" rx="20" fill="url(#clayDark)" filter="url(#clayShadowSm)" />
    <text x="1296" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">Active Filter Slate</text>
    <text x="1296" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#cbd5e1">#1E293B → #0F172A</text>

    <!-- Swatch 6 -->
    <rect x="1576" y="938" width="280" height="164" rx="20" fill="url(#clayIndigo)" filter="url(#clayShadowSm)" />
    <text x="1600" y="1054" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="800" fill="#ffffff">Action Indigo</text>
    <text x="1600" y="1078" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#e0e7ff">#4338CA → #312E81</text>

    <!-- Flow Specification Card -->
    <rect x="1884" y="938" width="1740" height="164" rx="20" fill="#ffffff" stroke="#dce4ee" />
    <text x="1916" y="976" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="800" fill="#0f172a">Alur Operasional POS (Dual Payment Mode + KDS Auto-Handoff)</text>
    <text x="1916" y="1008" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">1. Pilih Meja Hijau (Open Table) → 2. Input Menu &amp; Modifier (Pilih Mode Bayar Belakang atau Bayar Langsung) → 3. Auto-Routing Struk Dapur, Bar &amp; Checker</text>
    <text x="1916" y="1038" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">4. KDS Live Station: Koki/Barista klik Matang lalu Oper ke Waiter (otomatis hilang dari KDS &amp; masuk antrean Siap Antar di Checker Waiter)</text>
    <text x="1916" y="1068" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">5. Waiter mencontreng menu saat disajikan di meja → 6. Settlement Kasir (Service 5% + PB1 10%), stok BOM terpotong, meja kembali Hijau Pekat</text>
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
