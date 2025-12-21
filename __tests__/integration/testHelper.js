/**
 * Integration Test Setup
 * 
 * Setup dan teardown untuk system testing dengan real database PostgreSQL
 * Menggunakan test database terpisah untuk isolasi
 */

const { PrismaClient } = require('@prisma/client');

// Gunakan test database URL dari environment variable atau fallback
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
    },
});

/**
 * Clean database sebelum test
 * Menghapus semua data untuk memulai dengan state bersih
 */
const cleanDatabase = async () => {
    // Hapus dalam urutan yang benar (respecting foreign keys)
    await prisma.passwordReset.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.feedback.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.bookingItem.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.package.deleteMany({});
    await prisma.service.deleteMany({});
    await prisma.asset.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
};

/**
 * Disconnect database setelah semua test selesai
 */
const disconnectDatabase = async () => {
    await prisma.$disconnect();
};

/**
 * Generate unique email untuk testing
 */
const generateTestEmail = () => {
    return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
};

/**
 * Test user data helper
 */
const createTestUser = (overrides = {}) => ({
    name: 'Test User',
    email: generateTestEmail(),
    password: 'TestPassword123!',
    phone: '08123456789',
    ...overrides,
});

module.exports = {
    prisma,
    cleanDatabase,
    disconnectDatabase,
    generateTestEmail,
    createTestUser,
};
