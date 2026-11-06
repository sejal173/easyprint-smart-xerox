import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Shop } from '../models/Shop.js';
import { AgentDevice } from '../models/AgentDevice.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'easyprint_super_secret_jwt_key_2026';
export const COOKIE_NAME = 'token';

/**
 * Middleware: require authenticated user via httpOnly cookie or Bearer token.
 */
export async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists. Please log in again.',
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact administrator.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication session.',
    });
  }
}

/**
 * Middleware: verify the user is an admin.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin permissions required.',
    });
  }
  next();
}

/**
 * Middleware: verify the user is an owner or admin.
 */
export function requireOwner(req, res, next) {
  if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'admin')) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Owner permissions required.',
    });
  }
  next();
}

/**
 * Helper to verify that a shop belongs to the logged in owner.
 * Returns 404 (not 403) if the shop does not exist or belongs to another owner.
 *
 * @param {string} shopId
 * @param {string} userId
 * @returns {Promise<Shop>}
 */
export async function getOwnerShopOr404(shopId, userId) {
  const shop = await Shop.findOne({ _id: shopId, owner: userId });
  if (!shop) {
    const error = new Error('Shop not found');
    error.statusCode = 404;
    throw error;
  }
  return shop;
}

/**
 * Middleware: require authenticated Windows background printing agent via Bearer token.
 */
export async function requireAgent(req, res, next) {
  try {
    let token = null;
    if (req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token && req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Agent authentication required. Missing Bearer token.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const agentDevice = await AgentDevice.findOne({
      tokenHash,
      isRevoked: false,
    });

    if (!agentDevice) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or revoked agent token.',
      });
    }

    req.agent = agentDevice;
    req.shop = agentDevice.shop;
    next();
  } catch (err) {
    next(err);
  }
}

