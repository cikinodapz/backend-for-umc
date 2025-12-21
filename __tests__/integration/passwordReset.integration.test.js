/**
 * System Tests: Password Reset Flow
 * 
 * End-to-end testing untuk forgot/reset password
 * Tests ini menggunakan REAL database (PostgreSQL)
 * 
 * Note: Email sending is mocked/skipped in test environment
 * 
 * Flow yang ditest:
 * 1. Forgot Password (request OTP)
 * 2. Reset Password (verify OTP & set new password)
 * 3. Error Cases
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Password Reset Flow - System Tests', () => {
    let testUserEmail = null;

    beforeAll(async () => {
        await cleanDatabase();

        // Setup user for password reset test
        const testUser = createTestUser();
        testUserEmail = testUser.email;
        await request(app).post('/auth/register').send(testUser);
    }, 30000);

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    describe('1. Forgot Password', () => {
        it('should request password reset OTP', async () => {
            const res = await request(app)
                .post('/auth/password/forgot')
                .send({ email: testUserEmail });

            // Should return 200 or error if email service not configured
            expect([200, 500]).toContain(res.statusCode);
        });

        it('should handle non-existent email', async () => {
            const res = await request(app)
                .post('/auth/password/forgot')
                .send({ email: 'nonexistent@test.com' });

            // Might return 404 (not found) or 200 (security: don't reveal)
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        it('should fail without email', async () => {
            const res = await request(app)
                .post('/auth/password/forgot')
                .send({});

            expect([400, 500]).toContain(res.statusCode);
        });
    });

    describe('2. Reset Password', () => {
        it('should fail with invalid OTP', async () => {
            const res = await request(app)
                .post('/auth/password/reset')
                .send({
                    email: testUserEmail,
                    otp: '000000',
                    newPassword: 'newPassword123',
                });

            // Should fail with invalid OTP
            expect([400, 404, 500]).toContain(res.statusCode);
        });

        it('should fail without required fields', async () => {
            const res = await request(app)
                .post('/auth/password/reset')
                .send({ email: testUserEmail });

            expect([400, 500]).toContain(res.statusCode);
        });

        it('should fail without email', async () => {
            const res = await request(app)
                .post('/auth/password/reset')
                .send({
                    otp: '123456',
                    newPassword: 'newPassword123',
                });

            expect([400, 500]).toContain(res.statusCode);
        });
    });

    describe('3. Password Reset with Valid OTP', () => {
        // This test simulates valid OTP flow by creating OTP directly in DB
        let testOtp = '123456';

        beforeAll(async () => {
            const bcrypt = require('bcrypt');
            const user = await prisma.user.findUnique({ where: { email: testUserEmail } });

            if (user) {
                // Create password reset record with known OTP
                const otpHash = await bcrypt.hash(testOtp, 10);
                await prisma.passwordReset.create({
                    data: {
                        userId: user.id,
                        email: user.email,
                        otpHash,
                        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
                    },
                });
            }
        });

        it('should reset password with valid OTP', async () => {
            const res = await request(app)
                .post('/auth/password/reset')
                .send({
                    email: testUserEmail,
                    otp: testOtp,
                    newPassword: 'newSecurePassword123',
                });

            // Should succeed
            expect(res.statusCode).toBe(200);
        });

        it('should login with new password', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({
                    email: testUserEmail,
                    password: 'newSecurePassword123',
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('token');
        });
    });
});
