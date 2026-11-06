process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import FormData from 'form-data';

import { app } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { initStorage } from '../src/config/storage.js';
import { Shop, Order, OrderFile } from '../src/models/index.js';

let server;
let baseUrl;

// Helper to generate in-memory dummy PDF with specific page count
async function createTestPdf(pageCount = 3) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]); // A4 size
    page.drawText(`EasyPrint Test Page ${i + 1} of ${pageCount}`, {
      x: 50,
      y: 750,
      size: 18,
      color: rgb(0.1, 0.5, 0.8),
    });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// Helper to generate test PNG image
async function createTestPng() {
  return await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 14, g: 165, b: 233, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

test.before(async () => {
  await initStorage();
  await connectDB();

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[Test Server] Running on ${baseUrl}`);
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
});

test('1. GET /api/shops/quickcopy-central returns shop details and QR code', async () => {
  const res = await fetch(`${baseUrl}/api/shops/quickcopy-central`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.shop.slug, 'quickcopy-central');
  assert.equal(data.shop.availability, 'ONLINE');
  assert.ok(data.shop.priceSettings.bwPerPage > 0);
  assert.ok(data.shop.qrCode.dataUrl.startsWith('data:image/png;base64,'));
});

test('2. GET /api/shops/quickcopy-central/qrcode returns raw PNG image stream', async () => {
  const res = await fetch(`${baseUrl}/api/shops/quickcopy-central/qrcode`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 100);
});

let uploadedFileIds = [];

test('3. POST /api/upload accepts valid PDF and PNG, validates magic bytes & page counts', async () => {
  const pdf5Buffer = await createTestPdf(5);
  const pdf12Buffer = await createTestPdf(12);
  const pngBuffer = await createTestPng();

  const form = new FormData();
  form.append('files', pdf5Buffer, { filename: 'homework_assignment.pdf', contentType: 'application/pdf' });
  form.append('files', pdf12Buffer, { filename: 'project_report.pdf', contentType: 'application/pdf' });
  form.append('files', pngBuffer, { filename: 'id_card_scan.png', contentType: 'image/png' });

  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders(),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.files.length, 3);

  // Check detected page counts
  assert.equal(data.files[0].pageCount, 5);
  assert.equal(data.files[0].mimeType, 'application/pdf');

  assert.equal(data.files[1].pageCount, 12);
  assert.equal(data.files[1].mimeType, 'application/pdf');

  assert.equal(data.files[2].pageCount, 1);
  assert.equal(data.files[2].mimeType, 'image/png');

  uploadedFileIds = data.files.map((f) => f.fileId);
});

test('4. POST /api/upload rejects spoofed files failing magic byte inspection', async () => {
  // A text file fraudulently renamed as .pdf
  const fakePdfBuffer = Buffer.from('This is a plain text file pretending to be PDF');
  const form = new FormData();
  form.append('files', fakePdfBuffer, { filename: 'spoofed_malicious.pdf', contentType: 'application/pdf' });

  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders(),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /only genuine PDF, JPG, JPEG, and PNG files are accepted/i);
});

test('5. POST /api/pricing/quote calculates accurate prices across all options', async () => {
  // Case A: Default B&W, Single-sided, A4, 1 copy, 5 pages (doc 1)
  const quoteA = await (
    await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'quickcopy-central',
        files: [{ pageCount: 5 }],
        options: { colorMode: 'bw', sides: 'single', paperSize: 'A4', copies: 1 },
      }),
    })
  ).json();

  assert.equal(quoteA.success, true);
  assert.equal(quoteA.breakdown.effectivePages, 5);
  assert.equal(quoteA.totalAmount, 10.0); // 5 pages * ₹2.00 = ₹10.00

  // Case B: Color Mode, 5 pages
  const quoteB = await (
    await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'quickcopy-central',
        files: [{ pageCount: 5 }],
        options: { colorMode: 'color', sides: 'single', paperSize: 'A4', copies: 1 },
      }),
    })
  ).json();
  assert.equal(quoteB.totalAmount, 50.0); // 5 * ₹10.00 = ₹50.00

  // Case C: Duplex Mode (Both sides), 10 pages
  // 10 pages = 5 sheets, 5 double-sided sheets = 5 * ₹0.50 discount = ₹2.50 discount
  // Base = 10 * 2 = 20 - 2.50 = 17.50
  const quoteC = await (
    await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'quickcopy-central',
        files: [{ pageCount: 10 }],
        options: { colorMode: 'bw', sides: 'double', paperSize: 'A4', copies: 1 },
      }),
    })
  ).json();
  assert.equal(quoteC.breakdown.sheetsPerCopy, 5);
  assert.equal(quoteC.breakdown.duplexDiscountTotal, 2.5);
  assert.equal(quoteC.totalAmount, 17.5);

  // Case D: Custom Page Range "1-3, 5" on a 10-page document
  // Selected pages: 1, 2, 3, 5 -> 4 pages * ₹2 = ₹8.00
  const quoteD = await (
    await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'quickcopy-central',
        files: [{ pageCount: 10 }],
        options: {
          colorMode: 'bw',
          sides: 'single',
          pageSelection: 'custom',
          customRange: '1-3, 5',
          copies: 1,
        },
      }),
    })
  ).json();
  assert.equal(quoteD.breakdown.effectivePages, 4);
  assert.equal(quoteD.totalAmount, 8.0);

  // Case E: A3 Paper Size (2x multiplier)
  const quoteE = await (
    await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'quickcopy-central',
        files: [{ pageCount: 5 }],
        options: { colorMode: 'bw', sides: 'single', paperSize: 'A3', copies: 1 },
      }),
    })
  ).json();
  assert.equal(quoteE.totalAmount, 20.0); // 5 * 2 * 2x = 20.00
});

test('6. POST /api/orders/draft creates draft order with unique order number', async () => {
  const res = await fetch(`${baseUrl}/api/orders/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopSlug: 'quickcopy-central',
      customerPhone: '+91 98765 11111',
      fileIds: uploadedFileIds,
      options: {
        pageSelection: 'all',
        colorMode: 'bw',
        sides: 'single',
        paperSize: 'A4',
        paperQuality: 'normal',
        copies: 2,
        pagesPerSheet: 1,
      },
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.order.orderNumber);
  assert.match(data.order.orderNumber, /^EP-\d{6}-\d{4}$/);
  assert.equal(data.order.status, 'draft');
  assert.equal(data.order.files.length, 3);

  // Total pages = 5 + 12 + 1 = 18 pages. 18 * ₹2 = ₹36 per copy. 2 copies = ₹72.00
  assert.equal(data.order.totalAmount, 72.0);

  // Verify stored in MongoDB
  const dbOrder = await Order.findOne({ orderNumber: data.order.orderNumber });
  assert.ok(dbOrder);
  assert.equal(dbOrder.status, 'draft');
  assert.equal(dbOrder.customerPhone, '+91 98765 11111');

  const dbFiles = await OrderFile.find({ order: dbOrder._id });
  assert.equal(dbFiles.length, 3);
});
