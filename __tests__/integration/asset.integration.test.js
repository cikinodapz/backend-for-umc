/**
 * System Tests: Asset Management Flow
 * 
 * End-to-end testing untuk manajemen asset
 * Tests ini menggunakan REAL database (PostgreSQL)
 * 
 * Flow yang ditest:
 * 1. Create Asset (Admin)
 * 2. Read Assets (List & Detail)
 * 3. Update Asset
 * 4. Delete Asset
 * 5. Error Cases
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Asset Management Flow - System Tests', () => {
    let userToken = null;
    let adminToken = null;
    let testCategory = null;
    let testAsset = null;

    beforeAll(async () => {
        await cleanDatabase();

        // Setup regular user
        const testUser = createTestUser();
        await request(app).post('/auth/register').send(testUser);
        const userLoginRes = await request(app).post('/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        userToken = userLoginRes.body.token;

        // Setup admin
        const adminUser = createTestUser({ name: 'Admin Asset' });
        await request(app).post('/auth/register').send(adminUser);
        await prisma.user.update({
            where: { email: adminUser.email },
            data: { role: 'ADMIN' },
        });
        const adminLoginRes = await request(app).post('/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        adminToken = adminLoginRes.body.token;

        // Create ASET category
        testCategory = await prisma.category.create({
            data: { name: 'Asset Test Category', type: 'ASET' },
        });
    }, 30000);

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    describe('1. Create Asset', () => {
        it('should create a new asset', async () => {
            const res = await request(app)
                .post('/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Test Camera',
                    code: 'CAM-001',
                    categoryId: testCategory.id,
                    stock: 5,
                    specification: 'Professional DSLR Camera',
                    conditionNow: 'BAIK',
                    status: 'TERSEDIA',
                    dailyRate: 100000,
                });

            expect([200, 201]).toContain(res.statusCode);
            testAsset = res.body.asset || res.body;
            expect(testAsset).toHaveProperty('id');
        });

        it('should fail with duplicate code', async () => {
            const res = await request(app)
                .post('/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Another Camera',
                    code: 'CAM-001', // Same code
                    categoryId: testCategory.id,
                    stock: 1,
                });
            expect(res.statusCode).toBe(400);
        });

        it('should fail without auth', async () => {
            const res = await request(app)
                .post('/assets')
                .send({
                    name: 'No Auth Asset',
                    code: 'CAM-002',
                    categoryId: testCategory.id,
                    stock: 1,
                });
            expect(res.statusCode).toBe(401);
        });
    });

    describe('2. Read Assets', () => {
        it('should get all assets', async () => {
            const res = await request(app)
                .get('/assets')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('should get asset by ID', async () => {
            const res = await request(app)
                .get(`/assets/${testAsset.id}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.id).toBe(testAsset.id);
        });

        it('should fail without auth', async () => {
            const res = await request(app).get('/assets');
            expect(res.statusCode).toBe(401);
        });

        it('should return error for non-existent asset', async () => {
            const res = await request(app)
                .get('/assets/non-existent-id')
                .set('Authorization', `Bearer ${userToken}`);
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('3. Update Asset', () => {
        it('should update asset details', async () => {
            const res = await request(app)
                .patch(`/assets/${testAsset.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Updated Camera Name',
                    stock: 10,
                    specification: 'Updated specification',
                });

            expect(res.statusCode).toBe(200);
        });

        it('should update asset status', async () => {
            const res = await request(app)
                .patch(`/assets/${testAsset.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'DIPINJAM' });

            expect(res.statusCode).toBe(200);

            // Reset status
            await request(app)
                .patch(`/assets/${testAsset.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TERSEDIA' });
        });

        it('should fail without auth', async () => {
            const res = await request(app)
                .patch(`/assets/${testAsset.id}`)
                .send({ name: 'No Auth Update' });
            expect(res.statusCode).toBe(401);
        });

        it('should handle non-existent asset update', async () => {
            const res = await request(app)
                .patch('/assets/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Should Fail' });
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('4. Delete Asset', () => {
        let tempAsset = null;

        beforeAll(async () => {
            // Create temp asset for deletion
            tempAsset = await prisma.asset.create({
                data: {
                    name: 'Temp Delete Asset',
                    code: 'TEMP-DEL-001',
                    categoryId: testCategory.id,
                    stock: 1,
                },
            });
        });

        it('should delete asset', async () => {
            const res = await request(app)
                .delete(`/assets/${tempAsset.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 204]).toContain(res.statusCode);
        });

        it('should fail without auth', async () => {
            const res = await request(app)
                .delete(`/assets/${testAsset.id}`);
            expect(res.statusCode).toBe(401);
        });

        it('should handle non-existent asset deletion', async () => {
            const res = await request(app)
                .delete('/assets/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`);
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('5. Asset with Category', () => {
        it('should have category information in asset', async () => {
            const res = await request(app)
                .get(`/assets/${testAsset.id}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('category');
        });
    });
});
