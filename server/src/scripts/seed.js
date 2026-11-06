import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import { User, Shop, ShopQrCode, Order, Counter } from '../models/index.js';

dotenv.config();

/**
 * Seeds the demo owner user and shop if not already present.
 * Idempotent: does NOT overwrite existing password or user records.
 */
export async function seedOwnerUser() {
  const demoEmail = (process.env.OWNER_SEED_EMAIL || 'owner@easyprint.test').toLowerCase().trim();
  const demoPassword = process.env.OWNER_SEED_PASSWORD;
  const demoSlug = 'quickcopy-central';

  if (!demoPassword) {
    throw new Error('[Seed Error] Missing OWNER_SEED_PASSWORD environment variable. Set OWNER_SEED_PASSWORD in your environment before seeding.');
  }

  let owner = await User.findOne({ email: demoEmail });
  if (!owner) {
    console.log(`[Seed] Creating Demo Shop Owner (${demoEmail})...`);
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    owner = await User.create({
      name: 'Rajesh Sharma',
      email: demoEmail,
      passwordHash,
      role: 'owner',
    });
    console.log(`[Seed] Created User: ${owner.name} (${owner.email})`);
  } else {
    console.log(`[Seed] User ${owner.email} already exists; preserving existing credentials.`);
  }

  let shop = await Shop.findOne({ slug: demoSlug });
  if (!shop) {
    console.log('[Seed] Creating Demo Xerox Shop...');
    shop = await Shop.create({
      owner: owner._id,
      name: 'QuickCopy Smart Xerox & Digital Prints',
      slug: demoSlug,
      address: 'Shop #4, Campus Commercial Complex, Opp. Main Gate, University Road',
      phone: '+91 98765 43210',
      email: 'contact@quickcopyxerox.com',
      location: { lat: 18.5204, lng: 73.8567 },
      isOnline: true,
      isApproved: true,
      status: 'active',
      priceSettings: {
        bwPerPage: 2.0,
        colorPerPage: 10.0,
        duplexDiscount: 0.5,
        a3Multiplier: 2.0,
        glossyPaperSurcharge: 5.0,
      },
      maxQueue: 100,
      openingHours: [
        { day: 'Monday', open: '08:30', close: '21:30' },
        { day: 'Tuesday', open: '08:30', close: '21:30' },
        { day: 'Wednesday', open: '08:30', close: '21:30' },
        { day: 'Thursday', open: '08:30', close: '21:30' },
        { day: 'Friday', open: '08:30', close: '21:30' },
        { day: 'Saturday', open: '09:00', close: '20:00' },
        { day: 'Sunday', open: '10:00', close: '18:00' },
      ],
      printers: [
        {
          name: 'HP LaserJet Pro M404dn (B&W High-Speed)',
          colorSupport: false,
          duplexSupport: true,
          paperSizes: ['A4'],
          isDefault: true,
        },
        {
          name: 'Canon imageRUNNER 2625 (Color & A3)',
          colorSupport: true,
          duplexSupport: true,
          paperSizes: ['A4', 'A3'],
          isDefault: false,
        },
      ],
    });
    console.log(`[Seed] Created Shop: "${shop.name}" with slug: "${shop.slug}"`);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const publicUrl = `${clientUrl}/s/${shop.slug}`;
    const pngDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#0284c7', light: '#ffffff' },
    });

    await ShopQrCode.create({
      shop: shop._id,
      publicUrl,
      pngDataUrl,
    });
    console.log(`[Seed] Generated QR Code for: ${publicUrl}`);
  } else {
    console.log(`[Seed] Shop "${shop.name}" already exists.`);
  }

  return { owner, shop };
}

async function seed() {
  try {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDB();
    const { owner, shop } = await seedOwnerUser();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const publicUrl = `${clientUrl}/s/${shop.slug}`;

    console.log('\n===============================================');
    console.log(' SEEDING COMPLETED SUCCESSFULLY!');
    console.log(` Demo Owner Login: ${owner.email}`);
    console.log(' Demo Owner Password: <configured via OWNER_SEED_PASSWORD in .env>');
    console.log(` Demo Shop URL: ${publicUrl}`);
    console.log('===============================================\n');

    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err.message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed();
}
