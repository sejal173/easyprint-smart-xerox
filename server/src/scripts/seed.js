import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import { User, Shop, ShopQrCode, Order, Counter } from '../models/index.js';

dotenv.config();

async function seed() {
  try {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDB();

    const demoEmail = 'owner@easyprint.test';
    const demoPassword = process.env.OWNER_SEED_PASSWORD || 'Owner@123';
    const demoSlug = 'quickcopy-central';

    console.log('[Seed] Cleaning existing demo records...');
    const existingUsers = await User.find({ email: { $in: [demoEmail, 'rajesh@quickcopy.com'] } });
    for (const u of existingUsers) {
      const shops = await Shop.find({ owner: u._id });
      for (const s of shops) {
        await ShopQrCode.deleteMany({ shop: s._id });
        await Order.deleteMany({ shop: s._id });
        await Counter.deleteMany({ key: new RegExp(`^queue:${s._id}:`) });
        await Shop.deleteOne({ _id: s._id });
      }
      await User.deleteOne({ _id: u._id });
    }

    console.log(`[Seed] Creating Demo Shop Owner (${demoEmail})...`);
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    const owner = await User.create({
      name: 'Rajesh Sharma',
      email: demoEmail,
      passwordHash,
      role: 'owner',
    });
    console.log(`[Seed] Created User: ${owner.name} (${owner.email})`);

    console.log('[Seed] Creating Demo Xerox Shop...');
    const shop = await Shop.create({
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

    console.log('\n===============================================');
    console.log(' SEEDING COMPLETED SUCCESSFULLY!');
    console.log(` Demo Owner Login: ${demoEmail}`);
    console.log(` Demo Owner Password: ${demoPassword}`);
    console.log(` Demo Shop URL: ${publicUrl}`);
    console.log('===============================================\n');

    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]', err);
    process.exit(1);
  }
}

seed();
