import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

/**
 * Seeds the platform admin account from environment variables if not present.
 * Idempotent: does not overwrite existing password.
 */
export async function seedAdminUser() {
  const email = (process.env.ADMIN_SEED_EMAIL || 'admin@example.com').toLowerCase().trim();
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!password) {
    throw new Error('[Admin Seed] Missing ADMIN_SEED_PASSWORD environment variable. Set ADMIN_SEED_PASSWORD in your environment before seeding.');
  }

  let admin = await User.findOne({ email });
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 12);
    admin = await User.create({
      name: 'Platform Administrator',
      email,
      passwordHash,
      role: 'admin',
      isSuspended: false,
    });
    console.log(`[Admin Seed] Created admin user: ${email}`);
  } else {
    console.log(`[Admin Seed] Admin user ${email} already exists; preserving existing credentials.`);
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      await admin.save();
      console.log(`[Admin Seed] Elevated existing user ${email} to admin role`);
    }
  }
  return admin;
}

export default seedAdminUser;

