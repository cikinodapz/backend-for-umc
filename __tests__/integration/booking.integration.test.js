/**
 * System Tests: Booking Flow
 * 
 * End-to-end testing untuk alur booking
 * Tests ini menggunakan REAL database (PostgreSQL)
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Booking Flow - System Tests', () => {
    let userToken = null;
    let adminToken = null;
    let testService = null;
    let testPackage = null;
    let testCategory = null;

    beforeAll(async () => {
        await cleanDatabase();

        // Setup user
        const testUser = createTestUser();
        await request(app).post('/auth/register').send(testUser);
        const userLoginRes = await request(app).post('/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        userToken = userLoginRes.body.token;

        // Setup admin
        const adminUser = createTestUser({ name: 'Admin User' });
        await request(app).post('/auth/register').send(adminUser);
        await prisma.user.update({
            where: { email: adminUser.email },
            data: { role: 'ADMIN' },
        });
        const adminLoginRes = await request(app).post('/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        adminToken = adminLoginRes.body.token;

        // Setup test data via Prisma
        testCategory = await prisma.category.create({
            data: { name: 'Test Category', type: 'JASA' },
        });

        testService = await prisma.service.create({
            data: {
                name: 'Test Service',
                unitRate: 50000,
                categoryId: testCategory.id,
                isActive: true,
            },
        });

        testPackage = await prisma.package.create({
            data: {
                name: 'Test Package',
                unitRate: 75000,
                serviceId: testService.id,
            },
        });
    });

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    describe('1. Browse Services', () => {
        it('should get all services', async () => {
            const res = await request(app)
                .get('/services')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toBe(200);
        });

        it('should get service by ID', async () => {
            const res = await request(app)
                .get(`/services/${testService.id}`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toBe(200);
        });
    });

    describe('2. Cart Operations', () => {
        it('should add to cart', async () => {
            const res = await request(app)
                .post('/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ serviceId: testService.id, packageId: testPackage.id, quantity: 1 });
            expect([200, 201]).toContain(res.statusCode);
        });

        it('should get cart', async () => {
            const res = await request(app)
                .get('/cart')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('3. Booking Creation', () => {
        it('should create booking from cart', async () => {
            const res = await request(app)
                .post('/bookings/checkout')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    startDate: new Date(Date.now() + 86400000).toISOString(),
                    endDate: new Date(Date.now() + 172800000).toISOString(),
                });
            expect(res.statusCode).toBe(201);
            // Response could be booking object or wrapped in { booking: ... }
            expect(res.body).toBeDefined();
        });

        it('should fail checkout with empty cart', async () => {
            const res = await request(app)
                .post('/bookings/checkout')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    startDate: new Date(Date.now() + 86400000).toISOString(),
                    endDate: new Date(Date.now() + 172800000).toISOString(),
                });
            expect(res.statusCode).toBe(400);
        });
    });

    describe('4. View Bookings', () => {
        it('should get user bookings', async () => {
            const res = await request(app)
                .get('/bookings')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('admin should get all bookings', async () => {
            const res = await request(app)
                .get('/bookings/admin/all')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
        });
    });

    describe('5. Authentication Errors', () => {
        it('should fail to access cart without auth', async () => {
            const res = await request(app).get('/cart');
            expect(res.statusCode).toBe(401);
        });

        it('should fail to access bookings without auth', async () => {
            const res = await request(app).get('/bookings');
            expect(res.statusCode).toBe(401);
        });

        it('should fail to checkout without auth', async () => {
            const res = await request(app)
                .post('/bookings/checkout')
                .send({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
            expect(res.statusCode).toBe(401);
        });
    });
});
