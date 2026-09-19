/**
 * Demo/dummy data seed — FOR LOCAL DEVELOPMENT AND EVALUATION ONLY.
 *
 * This is deliberately NOT wired into `bootstrap-admin.ts`, `db:migrate`, or
 * any part of the app's own startup path. The application itself never
 * inserts demo data — this script is an explicit, opt-in convenience for
 * trying the app out locally, and you run it yourself, on purpose, against
 * a database you already know is safe to fill with fake data.
 *
 * DO NOT run this against a production or shared-staging database.
 *
 * Usage:
 *   npm run seed:demo
 *
 * What this builds — a realistic small printer/toner/spare-parts business:
 *   - 6 categories, 8 brands, 3 suppliers, 4 customers, 2 locations
 *   - 21 products spanning printers, toners/ink, spare parts, paper and
 *     accessories — each with the printer-specific fields the app actually
 *     supports: compatible models, part numbers, printer/colour/consumable
 *     type — not just name + SKU
 *   - A believable stock history: purchases attributed to a specific
 *     supplier, sales attributed to a specific customer, occasional
 *     corrections — so History, the dashboard's "Printer Models & Their
 *     Stock" panel, and Reports all have something real to show
 *
 * Idempotent-ish: re-running skips categories/brands/suppliers/customers/
 * products that already exist (matched by their unique key) and only adds
 * fresh stock movements on top — safe to run more than once.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/server/db/client';
import { brands, categories, customers, locations, products, suppliers, users } from '../src/server/db/schema';
import { addStock, removeStock } from '../src/server/services/inventory-service';

async function ensureLocation(code: string, name: string, isDefault = false) {
  const existing = await db.select().from(locations).where(eq(locations.code, code)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(locations).values({ code, name, isDefault }).returning();
  return row!;
}

async function ensureCategory(name: string, slug: string) {
  const existing = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(categories).values({ name, slug }).returning();
  return row!;
}

async function ensureBrand(name: string) {
  const existing = await db.select().from(brands).where(eq(brands.name, name)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(brands).values({ name }).returning();
  return row!;
}

async function ensureSupplier(name: string, contactPerson: string, phone: string, email: string) {
  const existing = await db.select().from(suppliers).where(eq(suppliers.name, name)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(suppliers).values({ name, contactPerson, phone, email }).returning();
  return row!;
}

async function ensureCustomer(name: string, contactPerson: string, phone: string, email: string) {
  const existing = await db.select().from(customers).where(eq(customers.name, name)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(customers).values({ name, contactPerson, phone, email }).returning();
  return row!;
}

async function main() {
  const admin = await db.select().from(users).limit(1);
  const adminId = admin[0]?.id;
  if (!adminId) {
    console.error('No user found. Run `npm run bootstrap:admin` first, then re-run this script.');
    process.exit(1);
  }

  console.log('Seeding demo data for a printer/toner/spare-parts business...\n');

  // --- Locations ---------------------------------------------------------
  const mainStore = await ensureLocation('MAIN', 'Main Store', true);
  const warehouse = await ensureLocation('WH01', 'Backup Warehouse');

  // --- Categories ----------------------------------------------------------
  const catPrinters = await ensureCategory('Printers', 'printers');
  const catToners = await ensureCategory('Toners & Ink', 'toners-ink');
  const catParts = await ensureCategory('Spare Parts', 'spare-parts');
  const catPaper = await ensureCategory('Paper', 'paper');
  const catAccessories = await ensureCategory('Accessories', 'accessories');
  await ensureCategory('Maintenance', 'maintenance');

  // --- Brands ----------------------------------------------------------------
  const hp = await ensureBrand('HP');
  const canon = await ensureBrand('Canon');
  const epson = await ensureBrand('Epson');
  const brother = await ensureBrand('Brother');
  const kyocera = await ensureBrand('Kyocera');
  await ensureBrand('Ricoh');
  await ensureBrand('Xerox');
  await ensureBrand('Lexmark');

  // --- Suppliers ---------------------------------------------------------
  const supplierA = await ensureSupplier(
    'Hyderabad Office Distributors',
    'Ramesh Kumar',
    '+91 98765 43210',
    'ramesh@hydoffice.example',
  );
  const supplierB = await ensureSupplier(
    'National Printer Parts Co.',
    'Priya Nair',
    '+91 91234 56789',
    'priya@nationalparts.example',
  );
  const supplierC = await ensureSupplier(
    'Southern Toner Wholesale',
    'Arjun Reddy',
    '+91 90000 11223',
    'arjun@southerntoner.example',
  );

  // --- Customers ----------------------------------------------------------
  const custOffice = await ensureCustomer(
    'Sri Lakshmi Enterprises',
    'Venkat Rao',
    '+91 99887 76655',
    'venkat@srilakshmi.example',
  );
  const custCollege = await ensureCustomer(
    'St. Xavier College Admin Office',
    'Sister Mary Thomas',
    '+91 98123 45678',
    'admin@stxaviercollege.example',
  );
  const custCyberCafe = await ensureCustomer(
    'Quick Print Cyber Cafe',
    'Naveen Kumar',
    '+91 97654 32109',
    'naveen@quickprint.example',
  );
  const custWalkIn = await ensureCustomer('Walk-in Customer', '', '', '');

  // --- Products ------------------------------------------------------------
  type PrinterType = 'LASER' | 'INKJET' | 'MULTIFUNCTION' | 'DOT_MATRIX' | 'PHOTO' | 'THERMAL';
  type ColorType = 'MONO' | 'COLOUR' | 'BLACK' | 'CYAN' | 'MAGENTA' | 'YELLOW' | 'TRICOLOUR';
  type ConsumableType = 'TONER_CARTRIDGE' | 'INK_CARTRIDGE' | 'INK_BOTTLE' | 'DRUM_UNIT' | 'WASTE_TONER' | 'PRINT_HEAD' | 'MAINTENANCE_KIT' | 'FUSER';

  interface SeedProduct {
    name: string;
    sku: string;
    categoryId: string;
    brandId: string;
    minimumStock: number;
    startingStock: number;
    unit: 'PIECE' | 'BOX' | 'PACK' | 'REAM';
    partNumber?: string;
    manufacturerPartNumber?: string;
    printerType?: PrinterType;
    colorType?: ColorType;
    consumableType?: ConsumableType;
    compatibility?: string[];
  }

  const seedProducts: SeedProduct[] = [
    // Printers
    { name: 'HP LaserJet Pro M15w', sku: 'HP-M15W', categoryId: catPrinters.id, brandId: hp.id, minimumStock: 2, startingStock: 5, unit: 'PIECE', printerType: 'LASER', colorType: 'MONO' },
    { name: 'Canon PIXMA G3010', sku: 'CANON-G3010', categoryId: catPrinters.id, brandId: canon.id, minimumStock: 2, startingStock: 0, unit: 'PIECE', printerType: 'INKJET', colorType: 'COLOUR' },
    { name: 'Epson L3250 MFP', sku: 'EPSON-L3250', categoryId: catPrinters.id, brandId: epson.id, minimumStock: 2, startingStock: 3, unit: 'PIECE', printerType: 'MULTIFUNCTION', colorType: 'COLOUR' },
    { name: 'Brother HL-L2321D', sku: 'BRO-L2321D', categoryId: catPrinters.id, brandId: brother.id, minimumStock: 2, startingStock: 2, unit: 'PIECE', printerType: 'LASER', colorType: 'MONO' },
    { name: 'Kyocera ECOSYS M2040dn', sku: 'KYO-M2040DN', categoryId: catPrinters.id, brandId: kyocera.id, minimumStock: 1, startingStock: 1, unit: 'PIECE', printerType: 'MULTIFUNCTION', colorType: 'MONO' },

    // Toners & ink — the compatibility field is what makes the dashboard's
    // "Printer Models & Their Stock" panel actually useful.
    { name: 'HP 12A Black Toner', sku: 'HP-12A-BLK', categoryId: catToners.id, brandId: hp.id, minimumStock: 10, startingStock: 34, unit: 'PIECE', partNumber: 'Q2612A', consumableType: 'TONER_CARTRIDGE', colorType: 'BLACK', compatibility: ['HP LaserJet 1010', 'HP LaserJet 1020', 'HP LaserJet 3050'] },
    { name: 'HP 12A Toner (Twin Pack)', sku: 'HP-12A-TWIN', categoryId: catToners.id, brandId: hp.id, minimumStock: 5, startingStock: 4, unit: 'BOX', consumableType: 'TONER_CARTRIDGE', colorType: 'BLACK', compatibility: ['HP LaserJet 1010', 'HP LaserJet 1020'] },
    { name: 'HP M15w Toner Cartridge', sku: 'HP-M15W-TONER', categoryId: catToners.id, brandId: hp.id, minimumStock: 8, startingStock: 15, unit: 'PIECE', consumableType: 'TONER_CARTRIDGE', colorType: 'BLACK', compatibility: ['HP LaserJet Pro M15w', 'HP LaserJet Pro M17w'] },
    { name: 'Canon 810 Black Ink', sku: 'CANON-810', categoryId: catToners.id, brandId: canon.id, minimumStock: 15, startingStock: 8, unit: 'PIECE', consumableType: 'INK_CARTRIDGE', colorType: 'BLACK', compatibility: ['Canon PIXMA G3010', 'Canon PIXMA MG2570'] },
    { name: 'Canon 811 Colour Ink', sku: 'CANON-811', categoryId: catToners.id, brandId: canon.id, minimumStock: 15, startingStock: 0, unit: 'PIECE', consumableType: 'INK_CARTRIDGE', colorType: 'TRICOLOUR', compatibility: ['Canon PIXMA G3010', 'Canon PIXMA MG2570'] },
    { name: 'Brother TN-2365 Toner', sku: 'BRO-TN2365', categoryId: catToners.id, brandId: brother.id, minimumStock: 8, startingStock: 12, unit: 'PIECE', consumableType: 'TONER_CARTRIDGE', colorType: 'BLACK', compatibility: ['Brother HL-L2321D', 'Brother HL-L2340DW'] },
    { name: 'Epson 003 Ink Bottle Set', sku: 'EPSON-003-SET', categoryId: catToners.id, brandId: epson.id, minimumStock: 6, startingStock: 2, unit: 'BOX', consumableType: 'INK_CARTRIDGE', colorType: 'COLOUR', compatibility: ['Epson L3250 MFP', 'Epson L3210'] },
    { name: 'Kyocera TK-1170 Toner', sku: 'KYO-TK1170', categoryId: catToners.id, brandId: kyocera.id, minimumStock: 4, startingStock: 6, unit: 'PIECE', consumableType: 'TONER_CARTRIDGE', colorType: 'BLACK', compatibility: ['Kyocera ECOSYS M2040dn', 'Kyocera ECOSYS M2540dn'] },

    // Spare parts
    { name: 'HP LaserJet Fuser Unit', sku: 'HP-FUSER-M15', categoryId: catParts.id, brandId: hp.id, minimumStock: 3, startingStock: 1, unit: 'PIECE', consumableType: 'FUSER', compatibility: ['HP LaserJet Pro M15w'], manufacturerPartNumber: 'RM2-5399' },
    { name: 'Universal Pickup Roller', sku: 'GEN-PICKUP-01', categoryId: catParts.id, brandId: hp.id, minimumStock: 10, startingStock: 22, unit: 'PIECE', consumableType: 'MAINTENANCE_KIT' },
    { name: 'Canon Drum Unit DR-2355', sku: 'CANON-DR2355', categoryId: catParts.id, brandId: canon.id, minimumStock: 4, startingStock: 6, unit: 'PIECE', consumableType: 'DRUM_UNIT', compatibility: ['Canon imageCLASS MF244dw'] },

    // Paper
    { name: 'A4 Copier Paper (500 sheets)', sku: 'PAPER-A4-500', categoryId: catPaper.id, brandId: hp.id, minimumStock: 20, startingStock: 65, unit: 'REAM' },
    { name: 'A3 Photo Paper Glossy', sku: 'PAPER-A3-PHOTO', categoryId: catPaper.id, brandId: epson.id, minimumStock: 10, startingStock: 3, unit: 'PACK' },

    // Accessories
    { name: 'USB Printer Cable 3m', sku: 'ACC-USB-3M', categoryId: catAccessories.id, brandId: hp.id, minimumStock: 15, startingStock: 40, unit: 'PIECE' },
    { name: 'Wi-Fi Print Server Adapter', sku: 'ACC-WIFI-PS', categoryId: catAccessories.id, brandId: brother.id, minimumStock: 5, startingStock: 0, unit: 'PIECE' },
    { name: 'Laptop Cooling Pad', sku: 'ACC-COOL-PAD', categoryId: catAccessories.id, brandId: hp.id, minimumStock: 8, startingStock: 12, unit: 'PIECE' },
  ];

  const inMovements = [
    { reason: 'Purchase', supplier: supplierA },
    { reason: 'Purchase', supplier: supplierB },
    { reason: 'Purchase', supplier: supplierC },
    { reason: 'Restock', supplier: supplierB },
  ];
  const outMovements = [
    { reason: 'Sale', customer: custOffice },
    { reason: 'Sale', customer: custCollege },
    { reason: 'Sale', customer: custCyberCafe },
    { reason: 'Sale', customer: custWalkIn },
    { reason: 'Damaged', customer: null },
  ];

  for (const p of seedProducts) {
    const existing = await db.select().from(products).where(eq(products.sku, p.sku)).limit(1);
    let product = existing[0];

    if (!product) {
      const [row] = await db
        .insert(products)
        .values({
          sku: p.sku,
          name: p.name,
          categoryId: p.categoryId,
          brandId: p.brandId,
          minimumStock: p.minimumStock,
          unit: p.unit,
          partNumber: p.partNumber,
          manufacturerPartNumber: p.manufacturerPartNumber,
          printerType: p.printerType,
          colorType: p.colorType,
          consumableType: p.consumableType,
          compatibility: p.compatibility ?? [],
          createdById: adminId,
          updatedById: adminId,
        })
        .returning();
      product = row!;
      console.log(`  + ${p.sku} — ${p.name}`);
    } else {
      console.log(`  · ${p.sku} already exists, adding transactions only`);
    }

    // Initial purchase, attributed to a real supplier.
    if (p.startingStock > 0) {
      const supplier = inMovements[Math.floor(Math.random() * inMovements.length)]!.supplier;
      await addStock({
        productId: product.id,
        locationId: mainStore.id,
        quantity: p.startingStock,
        reason: 'Purchase',
        notes: 'Initial stock (demo data)',
        supplierId: supplier.id,
        requestId: randomUUID(),
        performedById: adminId,
      });
    }

    // A little churn — some purchases (with a supplier), some sales (with a
    // customer) — so History, the dashboard, and Reports have real movements
    // to show, each properly attributed the way the app actually supports.
    const movementCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < movementCount; i++) {
      const isAdd = Math.random() > 0.5;
      const qty = 1 + Math.floor(Math.random() * 5);
      try {
        if (isAdd) {
          const { reason, supplier } = inMovements[Math.floor(Math.random() * inMovements.length)]!;
          await addStock({
            productId: product.id,
            locationId: mainStore.id,
            quantity: qty,
            reason,
            supplierId: supplier.id,
            requestId: randomUUID(),
            performedById: adminId,
          });
        } else {
          const { reason, customer } = outMovements[Math.floor(Math.random() * outMovements.length)]!;
          await removeStock({
            productId: product.id,
            locationId: mainStore.id,
            quantity: qty,
            reason,
            customerId: customer?.id ?? null,
            requestId: randomUUID(),
            performedById: adminId,
          });
        }
      } catch {
        // Insufficient stock on a random removal is fine — just skip it.
      }
    }

    // Put a small amount of a couple of items in the backup warehouse too,
    // so the "stock by location" view has something to show.
    if (p.sku === 'HP-12A-BLK' || p.sku === 'PAPER-A4-500') {
      await addStock({
        productId: product.id,
        locationId: warehouse.id,
        quantity: 10,
        reason: 'Restock',
        supplierId: supplierB.id,
        requestId: randomUUID(),
        performedById: adminId,
      });
    }
  }

  console.log('\nDone. Refresh the dashboard — you should see products, some low-stock,');
  console.log('some out-of-stock, printer models with real stock gaps, and a stock');
  console.log('history with purchases attributed to suppliers and sales to customers.');
  await pool.end();
}

main().catch(async (error) => {
  console.error('Seed failed:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
