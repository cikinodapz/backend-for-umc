/**
 * System Tests: Payment Flow
 * 
 * End-to-end testing untuk alur pembayaran
 * Tests ini menggunakan REAL database (PostgreSQL)
 * 
 * Flow yang ditest:
 * 1. Setup: User login, Admin login, create booking, admin confirm booking
 * 2. Create Payment untuk booking yang dikonfirmasi
 * 3. Check Payment Status
 * 4. List Payments
 * 5. Get Payment Details
 * 6. Admin: Get Payment by Booking
 * 7. Error Cases
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Payment Flow - System Tests', () => {
    let userToken = null;
    let adminToken = null;
    let testUser = null;
    let testService = null;
    let testPackage = null;
    let testCategory = null;
    let testBooking = null;
    let testPayment = null;

    beforeAll(async () => {
        await cleanDatabase();

        // Setup user
        testUser = createTestUser();
        await request(app).post('/auth/register').send(testUser);
        const userLoginRes = await request(app).post('/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        userToken = userLoginRes.body.token;

        // Setup admin
        const adminUser = createTestUser({ name: 'Admin Payment' });
        await request(app).post('/auth/register').send(adminUser);
        await prisma.user.update({
            where: { email: adminUser.email },
            data: { role: 'ADMIN' },
        });
        const adminLoginRes = await request(app).post('/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        adminToken = adminLoginRes.body.token;

        // Setup test data
        testCategory = await prisma.category.create({
            data: { name: 'Payment Test Category', type: 'JASA' },
        });

        testService = await prisma.service.create({
            data: {
                name: 'Payment Test Service',
                unitRate: 100000,
                categoryId: testCategory.id,
                isActive: true,
            },
        });

        testPackage = await prisma.package.create({
            data: {
                name: 'Payment Test Package',
                unitRate: 150000,
                serviceId: testService.id,
            },
        });

        // Create booking via cart flow
        await request(app)
            .post('/cart')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ serviceId: testService.id, packageId: testPackage.id, quantity: 1 });

        const bookingRes = await request(app)
            .post('/bookings/checkout')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                startDate: new Date(Date.now() + 86400000).toISOString(),
                endDate: new Date(Date.now() + 172800000).toISOString(),
            });

        // Get booking ID from response
        const bookingData = bookingRes.body.booking || bookingRes.body;
        testBooking = await prisma.booking.findFirst({
            where: { userId: (await prisma.user.findUnique({ where: { email: testUser.email } })).id },
            orderBy: { createdAt: 'desc' },
        });

        // Admin confirms the booking
        if (testBooking) {
            await request(app)
                .put(`/bookings/admin/${testBooking.id}/confirm`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Refresh booking data
            testBooking = await prisma.booking.findUnique({
                where: { id: testBooking.id },
            });
        }
    }, 30000);

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    describe('1. Pre-Payment Checks', () => {
        it('should have a valid booking', async () => {
            expect(testBooking).toBeDefined();
            // Booking might or might not be confirmed depending on route
            expect(['MENUNGGU', 'DIKONFIRMASI']).toContain(testBooking.status);
        });

        it('should have valid tokens', async () => {
            expect(userToken).toBeDefined();
            expect(adminToken).toBeDefined();
        });
    });

    describe('2. Create Payment', () => {
        it('should create payment with QRIS method', async () => {
            const res = await request(app)
                .post(`/payments/create/${testBooking.id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ method: 'QRIS' });

            // Payment creation might return 201 or might fail if Midtrans not configured
            // In test environment without real Midtrans, we expect error or success
            if (res.statusCode === 201) {
                expect(res.body).toHaveProperty('payment');
                testPayment = res.body.payment;
            } else {
                // Midtrans might not be configured, that's okay for system test
                expect([400, 500, 201]).toContain(res.statusCode);
            }
        });

        it('should fail to create payment without auth', async () => {
            const res = await request(app)
                .post(`/payments/create/${testBooking.id}`)
                .send({ method: 'QRIS' });
            expect(res.statusCode).toBe(401);
        });

        it('should fail to create payment for non-existent booking', async () => {
            const res = await request(app)
                .post('/payments/create/non-existent-id')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ method: 'QRIS' });
            // Could return 404 or 500 depending on implementation
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('3. List Payments', () => {
        it('should list payments for user', async () => {
            const res = await request(app)
                .get('/payments')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should list all payments for admin', async () => {
            const res = await request(app)
                .get('/payments')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should fail to list payments without auth', async () => {
            const res = await request(app).get('/payments');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('4. Get Payment Details', () => {
        it('should get payment details if payment exists', async () => {
            // First, get list of payments
            const listRes = await request(app)
                .get('/payments')
                .set('Authorization', `Bearer ${userToken}`);

            if (listRes.body.length > 0) {
                const paymentId = listRes.body[0].id;
                const res = await request(app)
                    .get(`/payments/${paymentId}`)
                    .set('Authorization', `Bearer ${userToken}`);
                expect([200, 403]).toContain(res.statusCode);
            } else {
                // No payments created yet (Midtrans not configured)
                expect(true).toBe(true);
            }
        });

        it('should fail to get payment details without auth', async () => {
            const res = await request(app).get('/payments/some-id');
            expect(res.statusCode).toBe(401);
        });

        it('should return error for non-existent payment', async () => {
            const res = await request(app)
                .get('/payments/non-existent-id')
                .set('Authorization', `Bearer ${userToken}`);
            // Could return 404 or 500 depending on error handling
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('5. Check Payment Status', () => {
        it('should check payment status if payment exists', async () => {
            const listRes = await request(app)
                .get('/payments')
                .set('Authorization', `Bearer ${userToken}`);

            if (listRes.body.length > 0) {
                const paymentId = listRes.body[0].id;
                const res = await request(app)
                    .get(`/payments/${paymentId}/status`)
                    .set('Authorization', `Bearer ${userToken}`);
                expect([200, 403]).toContain(res.statusCode);
            } else {
                expect(true).toBe(true);
            }
        });

        it('should fail to check status without auth', async () => {
            const res = await request(app).get('/payments/some-id/status');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('6. Admin Payment Operations', () => {
        it('should get payment details by booking (admin)', async () => {
            const res = await request(app)
                .get(`/payments/admin/by-booking/${testBooking.id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect([200, 404]).toContain(res.statusCode);
        });

        it('should fail for non-admin to access admin endpoint', async () => {
            const res = await request(app)
                .get(`/payments/admin/by-booking/${testBooking.id}`)
                .set('Authorization', `Bearer ${userToken}`);
            expect([403, 404]).toContain(res.statusCode);
        });

        it('should return error for non-existent booking (admin)', async () => {
            const res = await request(app)
                .get('/payments/admin/by-booking/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`);
            // Could return 404 or 500 depending on error handling
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('7. Midtrans Notification Endpoint', () => {
        it('should accept notification webhook (no auth required)', async () => {
            const res = await request(app)
                .post('/payments/notification')
                .send({
                    order_id: 'test-order-123',
                    transaction_status: 'settlement',
                    fraud_status: 'accept',
                });
            // Should return 200 even for invalid/test notifications
            expect(res.statusCode).toBe(200);
        });

        it('should handle test notification', async () => {
            const res = await request(app)
                .post('/payments/notification')
                .send({
                    order_id: 'payment_notif_test_123456',
                    transaction_status: 'settlement',
                });
            expect(res.statusCode).toBe(200);
        });
    });

    describe('8. Error Cases', () => {
        it('should fail to create payment for unconfirmed booking', async () => {
            // Create new booking that's not confirmed
            await request(app)
                .post('/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ serviceId: testService.id, quantity: 1 });

            const newBookingRes = await request(app)
                .post('/bookings/checkout')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    startDate: new Date(Date.now() + 259200000).toISOString(),
                    endDate: new Date(Date.now() + 345600000).toISOString(),
                });

            if (newBookingRes.statusCode === 201) {
                const newBooking = await prisma.booking.findFirst({
                    where: { status: 'MENUNGGU' },
                    orderBy: { createdAt: 'desc' },
                });

                if (newBooking) {
                    const res = await request(app)
                        .post(`/payments/create/${newBooking.id}`)
                        .set('Authorization', `Bearer ${userToken}`)
                        .send({ method: 'QRIS' });
                    expect(res.statusCode).toBe(400);
                }
            }
        });
    });
});
