import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

/**
 * Seeds the default admin account from environment variables if not present.
 */
export async function seedAdminUser() {
  const email = (process.env.ADMIN_SEED_EMAIL || 'admin@easyprint.test').toLowerCase().trim();
  const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@123456';

  try {
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
    } else if (admin.role !== 'admin') {
      admin.role = 'admin';
      await admin.save();
      console.log(`[Admin Seed] Elevated existing user ${email} to admin role`);
    }
    return admin;
  } catch (err) {
    console.error('[Admin Seed] Error seeding admin user:', err.message);
  }
}

export default seedAdminUser;

