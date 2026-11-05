import { MenuItem, Table, RawMaterial } from '../types/pos';

export const INITIAL_TABLES: Table[] = [
  // Area Indoor (AC) - 18 Meja
  { id: 'T01', tableNumber: '01', area: 'indoor', capacity: 2, status: 'available' },
  { id: 'T02', tableNumber: '02', area: 'indoor', capacity: 2, status: 'available' },
  { id: 'T03', tableNumber: '03', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T04', tableNumber: '04', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T05', tableNumber: '05', area: 'indoor', capacity: 4, status: 'occupied', currentTransactionId: 'TRX-SAMPLE-001', guestCount: 3, openedAt: new Date(Date.now() - 35 * 60000).toISOString(), waiterName: 'Doni' },
  { id: 'T06', tableNumber: '06', area: 'indoor', capacity: 6, status: 'available' },
  { id: 'T07', tableNumber: '07', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T08', tableNumber: '08', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T09', tableNumber: '09', area: 'indoor', capacity: 4, status: 'occupied', currentTransactionId: 'TRX-SAMPLE-002', guestCount: 2, openedAt: new Date(Date.now() - 15 * 60000).toISOString(), waiterName: 'Siti' },
  { id: 'T10', tableNumber: '10', area: 'indoor', capacity: 2, status: 'available' },
  { id: 'T11', tableNumber: '11', area: 'indoor', capacity: 2, status: 'available' },
  { id: 'T12', tableNumber: '12', area: 'indoor', capacity: 6, status: 'available' },
  { id: 'T13', tableNumber: '13', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T14', tableNumber: '14', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T15', tableNumber: '15', area: 'indoor', capacity: 4, status: 'occupied', currentTransactionId: 'TRX-SAMPLE-003', guestCount: 4, openedAt: new Date(Date.now() - 50 * 60000).toISOString(), waiterName: 'Budi' },
  { id: 'T16', tableNumber: '16', area: 'indoor', capacity: 8, status: 'available' },
  { id: 'T17', tableNumber: '17', area: 'indoor', capacity: 4, status: 'available' },
  { id: 'T18', tableNumber: '18', area: 'indoor', capacity: 4, status: 'available' },

  // Area Outdoor (Teras Garden) - 12 Meja
  { id: 'T19', tableNumber: '19', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T20', tableNumber: '20', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T21', tableNumber: '21', area: 'outdoor', capacity: 4, status: 'occupied', currentTransactionId: 'TRX-SAMPLE-004', guestCount: 2, openedAt: new Date(Date.now() - 20 * 60000).toISOString(), waiterName: 'Doni' },
  { id: 'T22', tableNumber: '22', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T23', tableNumber: '23', area: 'outdoor', capacity: 6, status: 'available' },
  { id: 'T24', tableNumber: '24', area: 'outdoor', capacity: 6, status: 'available' },
  { id: 'T25', tableNumber: '25', area: 'outdoor', capacity: 2, status: 'available' },
  { id: 'T26', tableNumber: '26', area: 'outdoor', capacity: 2, status: 'available' },
  { id: 'T27', tableNumber: '27', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T28', tableNumber: '28', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T29', tableNumber: '29', area: 'outdoor', capacity: 4, status: 'available' },
  { id: 'T30', tableNumber: '30', area: 'outdoor', capacity: 8, status: 'available' },

  // Area VIP (Lantai 2) - 6 Meja
  { id: 'T31', tableNumber: 'VIP-1', area: 'vip', capacity: 8, status: 'available' },
  { id: 'T32', tableNumber: 'VIP-2', area: 'vip', capacity: 10, status: 'available' },
  { id: 'T33', tableNumber: 'VIP-3', area: 'vip', capacity: 12, status: 'available' },
  { id: 'T34', tableNumber: 'VIP-4', area: 'vip', capacity: 6, status: 'available' },
  { id: 'T35', tableNumber: 'VIP-5', area: 'vip', capacity: 8, status: 'available' },
  { id: 'T36', tableNumber: 'VIP-6', area: 'vip', capacity: 10, status: 'available' },
];

export const RAW_MATERIALS: RawMaterial[] = [
  { id: 'raw-beras', name: 'Beras Pandan Wangi', unit: 'kg', currentStock: 30.0, minStock: 6.0, costPerUnit: 15000, storageZone: 'Dry Storage' },
  { id: 'raw-ayam', name: 'Daging Ayam Pejantan', unit: 'porsi', currentStock: 45, minStock: 10, costPerUnit: 14000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-bebek', name: 'Bebek Ungkep Kuning', unit: 'porsi', currentStock: 25, minStock: 5, costPerUnit: 22000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-gurame', name: 'Gurame Hidup Segar', unit: 'ekor', currentStock: 15, minStock: 3, costPerUnit: 35000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-buntut', name: 'Buntut Sapi Impor', unit: 'porsi', currentStock: 20, minStock: 4, costPerUnit: 32000, storageZone: 'Deep Freezer' },
  { id: 'raw-mie', name: 'Mie Telur Basah', unit: 'porsi', currentStock: 35, minStock: 8, costPerUnit: 6000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-kangkung', name: 'Kangkung Segar', unit: 'ikat', currentStock: 30, minStock: 8, costPerUnit: 4000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-teh', name: 'Teh Melati Wangi', unit: 'kg', currentStock: 8.0, minStock: 2.0, costPerUnit: 65000, storageZone: 'Dry Storage' },
  { id: 'raw-jeruk', name: 'Jeruk Manis Peras', unit: 'kg', currentStock: 40, minStock: 10, costPerUnit: 22000, storageZone: 'Walk-in Chiller' },
  { id: 'raw-kopi', name: 'Biji Kopi Espresso Blend', unit: 'kg', currentStock: 9.0, minStock: 2.0, costPerUnit: 180000, storageZone: 'Bar Station' },
  { id: 'raw-susu', name: 'Susu Fresh Milk Pasteurisasi', unit: 'liter', currentStock: 30, minStock: 8, costPerUnit: 21000, storageZone: 'Bar Station' },
  { id: 'raw-aren', name: 'Gula Aren Organik', unit: 'liter', currentStock: 18, minStock: 4, costPerUnit: 34000, storageZone: 'Bar Station' },
  { id: 'raw-pisang', name: 'Pisang Kepok Kuning', unit: 'sisir', currentStock: 35, minStock: 8, costPerUnit: 12000, storageZone: 'Dry Storage' },
  { id: 'raw-tahu', name: 'Tahu Sutra Bandung', unit: 'blok', currentStock: 40, minStock: 10, costPerUnit: 5500, storageZone: 'Walk-in Chiller' },
];

export const MENU_ITEMS: MenuItem[] = [
  // MAKANAN (Auto-Route ke Dapur)
  {
    id: 'food-1',
    name: 'Nasi Goreng Spesial Resto',
    category: 'makanan',
    destination: 'kitchen',
    price: 38000,
    cost: 13200, // HPP Food Cost
    stock: 50,
    description: 'Nasi goreng bumbu gurih dengan suwiran ayam, udang, telur mata sapi, acar & kerupuk.',
    recipe: [
      { rawMaterialId: 'raw-beras', amount: 0.15 }, // 150 gram
      { rawMaterialId: 'raw-ayam', amount: 0.5 }, // 0.5 porsi suwiran
    ],
    modifierGroups: [
      {
        id: 'pedas-1',
        name: 'Level Pedas',
        required: true,
        options: [
          { name: 'Tidak Pedas' },
          { name: 'Pedas Sedang' },
          { name: 'Sangat Pedas (+Rp 2.000)', priceDelta: 2000 },
        ],
      },
      {
        id: 'telur-1',
        name: 'Pilihan Telur',
        options: [
          { name: 'Mata Sapi Setengah Matang' },
          { name: 'Mata Sapi Matang' },
          { name: 'Telur Dadar' },
        ],
      },
    ],
  },
  {
    id: 'food-2',
    name: 'Ayam Bakar Madu Pedas',
    category: 'makanan',
    destination: 'kitchen',
    price: 42000,
    cost: 16500,
    stock: 35,
    description: 'Ayam pejantan bakar balutan bumbu madu rempah bakar arang wangi, lalapan & sambal.',
    recipe: [
      { rawMaterialId: 'raw-ayam', amount: 1.0 },
    ],
    modifierGroups: [
      {
        id: 'potongan-ayam',
        name: 'Pilihan Potongan',
        required: true,
        options: [
          { name: 'Paha Atas & Bawah' },
          { name: 'Dada & Sayap' },
        ],
      },
      {
        id: 'sambal-ayam',
        name: 'Pilihan Sambal',
        options: [
          { name: 'Sambal Terasi Bakar' },
          { name: 'Sambal Bawang Korek' },
          { name: 'Sambal Kecap Rawit' },
        ],
      },
    ],
  },
  {
    id: 'food-3',
    name: 'Bebek Goreng Serundeng Gurih',
    category: 'makanan',
    destination: 'kitchen',
    price: 48000,
    cost: 24000,
    stock: 25,
    description: 'Bebek ungkep bumbu kuning digoreng garing dengan taburan serundeng kelapa & sambal korek.',
    recipe: [
      { rawMaterialId: 'raw-bebek', amount: 1.0 },
    ],
  },
  {
    id: 'food-4',
    name: 'Gurame Bakar Jimbaran (Porsi 2-3 Org)',
    category: 'makanan',
    destination: 'kitchen',
    price: 85000,
    cost: 38000,
    stock: 15,
    description: 'Ikan gurame segar dibakar dengan pasta bumbu khas Jimbaran Bali bercita rasa gurih pedas manis.',
    recipe: [
      { rawMaterialId: 'raw-gurame', amount: 1.0 },
    ],
  },
  {
    id: 'food-5',
    name: 'Sate Ayam Madura (10 Tusuk)',
    category: 'makanan',
    destination: 'kitchen',
    price: 36000,
    cost: 14500,
    stock: 40,
    description: 'Daging ayam tanpa kulit dipanggang arang disiram bumbu kacang lembut kental & irisan lontong.',
    recipe: [
      { rawMaterialId: 'raw-ayam', amount: 1.0 },
    ],
  },
  {
    id: 'food-6',
    name: 'Sop Buntut Sapi Kuah Hangat',
    category: 'makanan',
    destination: 'kitchen',
    price: 72000,
    cost: 35000,
    stock: 20,
    description: 'Buntut sapi empuk dengan kuah kaldu rempah bening gurih, wortel, kentang & emping melinjo.',
    recipe: [
      { rawMaterialId: 'raw-buntut', amount: 1.0 },
    ],
  },
  {
    id: 'food-7',
    name: 'Mie Goreng Seafood Wok',
    category: 'makanan',
    destination: 'kitchen',
    price: 39000,
    cost: 15000,
    stock: 30,
    description: 'Mie telur ditumis cepat dengan api besar (wok hei), cumi segar, udang, bakso & sawi hijau.',
    recipe: [
      { rawMaterialId: 'raw-mie', amount: 1.0 },
    ],
  },
  {
    id: 'food-8',
    name: 'Tumis Kangkung Belacan Hotplate',
    category: 'makanan',
    destination: 'kitchen',
    price: 24000,
    cost: 6500,
    stock: 45,
    description: 'Kangkung muda renyah ditumis terasi udang belacan harum dengan irisan cabai merah.',
    recipe: [
      { rawMaterialId: 'raw-kangkung', amount: 1.0 },
    ],
  },

  // MINUMAN (Auto-Route ke Bar)
  {
    id: 'bev-1',
    name: 'Es Teh Manis Jasmine',
    category: 'minuman',
    destination: 'bar',
    price: 9000,
    cost: 1200,
    stock: 150,
    description: 'Teh melati seduh harum khas nusantara disajikan segar dingin.',
    recipe: [
      { rawMaterialId: 'raw-teh', amount: 0.015 }, // 15 gram
    ],
    modifierGroups: [
      {
        id: 'gula-teh',
        name: 'Tingkat Manis',
        options: [
          { name: 'Normal Manis' },
          { name: 'Less Sugar' },
          { name: 'Tawar (No Sugar)' },
        ],
      },
    ],
  },
  {
    id: 'bev-2',
    name: 'Es Jeruk Peras Murni',
    category: 'minuman',
    destination: 'bar',
    price: 18000,
    cost: 5500,
    stock: 80,
    description: '100% jeruk segar peras tanpa pemanis buatan, kaya vitamin C.',
    recipe: [
      { rawMaterialId: 'raw-jeruk', amount: 0.25 }, // 250 gram jeruk
    ],
  },
  {
    id: 'bev-3',
    name: 'Kopi Susu Gula Aren Barista',
    category: 'minuman',
    destination: 'bar',
    price: 24000,
    cost: 6800,
    stock: 60,
    description: 'Espresso blend Arabika-Robusta dengan susu segar creamy dan sirup gula aren organik.',
    recipe: [
      { rawMaterialId: 'raw-kopi', amount: 0.018 }, // 18 gram espresso
      { rawMaterialId: 'raw-susu', amount: 0.12 }, // 120 ml
      { rawMaterialId: 'raw-aren', amount: 0.025 }, // 25 ml
    ],
  },
  {
    id: 'bev-4',
    name: 'Jus Alpukat Kerok Saus Cokelat',
    category: 'minuman',
    destination: 'bar',
    price: 26000,
    cost: 9000,
    stock: 40,
    description: 'Alpukat mentega legit diblend kental dengan lelehan susu kental manis cokelat.',
  },
  {
    id: 'bev-5',
    name: 'Lychee Iced Tea with Real Fruit',
    category: 'minuman',
    destination: 'bar',
    price: 22000,
    cost: 6000,
    stock: 50,
    description: 'Teh beraroma leci segar dengan 2 buah leci utuh dan daun mint dingin.',
  },
  {
    id: 'bev-6',
    name: 'Wedang Jahe Susu Rempah',
    category: 'minuman',
    destination: 'bar',
    price: 20000,
    cost: 5000,
    stock: 35,
    description: 'Sari jahe merah geprek rebusan kapulaga, cengkeh & susu kental manis hangat.',
  },

  // SNACK & DESSERT
  {
    id: 'snack-1',
    name: 'Pisang Goreng Keju Cokelat',
    category: 'snack',
    destination: 'kitchen',
    price: 22000,
    cost: 6500,
    stock: 40,
    description: 'Pisang kepok matang dibalut tepung krispi dengan taburan keju cheddar parut melimpah & meses ceres.',
    recipe: [
      { rawMaterialId: 'raw-pisang', amount: 0.2 },
    ],
  },
  {
    id: 'snack-2',
    name: 'Tahu Cabe Garam Crispy',
    category: 'snack',
    destination: 'kitchen',
    price: 20000,
    cost: 4500,
    stock: 45,
    description: 'Potongan tahu sutra garing berbumbu bawang putih cincang gurih, cabai rawit potong & garam laut.',
    recipe: [
      { rawMaterialId: 'raw-tahu', amount: 1.0 },
    ],
  },
  {
    id: 'snack-3',
    name: 'Singkong Keju Sambal Roa Manado',
    category: 'snack',
    destination: 'kitchen',
    price: 24000,
    cost: 6000,
    stock: 30,
    description: 'Singkong empuk merekah dengan sambal roa asap khas Manado pedas mantap.',
  },
  {
    id: 'dessert-1',
    name: 'Es Cendol Durian Legit',
    category: 'dessert',
    destination: 'bar',
    price: 28000,
    cost: 11000,
    stock: 25,
    description: 'Cendol pandan kenyal dengan kuah santan gurih, gula kelapa asli, dan 1 butir daging durian montong.',
  },
];
