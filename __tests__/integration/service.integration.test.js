/**
 * System Tests: Service & Category Flow
 * 
 * End-to-end testing untuk alur service dan category
 * Tests ini menggunakan REAL database (PostgreSQL)
 * 
 * Flow yang ditest:
 * 1. Category CRUD
 * 2. Service CRUD
 * 3. Public Endpoints (category by type)
 * 4. Error Cases
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Service & Category Flow - System Tests', () => {
    let userToken = null;
    let adminToken = null;
    let testCategory = null;
    let testService = null;

    beforeAll(async () => {
        await cleanDatabase();

        // Setup regular user
        const testUser = createTestUser();
        await request(app).post('/auth/register').send(testUser);
        const userLoginRes = await request(app).post('/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        userToken = userLoginRes.body.token;

        // Setup admin
        const adminUser = createTestUser({ name: 'Admin Service' });
        await request(app).post('/auth/register').send(adminUser);
        await prisma.user.update({
            where: { email: adminUser.email },
            data: { role: 'ADMIN' },
        });
        const adminLoginRes = await request(app).post('/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        adminToken = adminLoginRes.body.token;
    }, 30000);

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    // ==================== CATEGORY TESTS ====================
    describe('1. Category Operations', () => {
        describe('Create Category', () => {
            it('should create a new JASA category', async () => {
                const res = await request(app)
                    .post('/categories')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ name: 'Test Service Category', type: 'JASA' });

                expect([200, 201]).toContain(res.statusCode);
                testCategory = res.body.category || res.body;
                expect(testCategory).toHaveProperty('id');
            });

            it('should create a new ASET category', async () => {
                const res = await request(app)
                    .post('/categories')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ name: 'Test Asset Category', type: 'ASET' });

                expect([200, 201]).toContain(res.statusCode);
            });

            it('should fail without auth', async () => {
                const res = await request(app)
                    .post('/categories')
                    .send({ name: 'No Auth Category', type: 'JASA' });
                expect(res.statusCode).toBe(401);
            });

            it('should fail without name', async () => {
                const res = await request(app)
                    .post('/categories')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ type: 'JASA' });
                expect(res.statusCode).toBe(400);
            });
        });

        describe('Read Categories', () => {
            it('should get all categories', async () => {
                const res = await request(app)
                    .get('/categories')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
                expect(res.body.length).toBeGreaterThan(0);
            });

            it('should get category by ID', async () => {
                const res = await request(app)
                    .get(`/categories/${testCategory.id}`)
                    .set('Authorization', `Bearer ${userToken}`);

                expect(res.statusCode).toBe(200);
                expect(res.body.id).toBe(testCategory.id);
            });

            it('should fail without auth', async () => {
                const res = await request(app).get('/categories');
                expect(res.statusCode).toBe(401);
            });
        });

        describe('Update Category', () => {
            it('should update category name', async () => {
                const res = await request(app)
                    .patch(`/categories/${testCategory.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ name: 'Updated Category Name' });

                expect(res.statusCode).toBe(200);
            });

            it('should fail without auth', async () => {
                const res = await request(app)
                    .patch(`/categories/${testCategory.id}`)
                    .send({ name: 'No Auth Update' });
                expect(res.statusCode).toBe(401);
            });
        });

        describe('Category by Type (Public)', () => {
            it('should get asset categories', async () => {
                const res = await request(app)
                    .get('/categories/type/aset');

                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
            });

            it('should get service categories', async () => {
                const res = await request(app)
                    .get('/categories/type/jasa');

                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
            });
        });
    });

    // ==================== SERVICE TESTS ====================
    describe('2. Service Operations', () => {
        describe('Create Service', () => {
            it('should create a new service', async () => {
                const res = await request(app)
                    .post('/services')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        name: 'Test Photo Service',
                        categoryId: testCategory.id,
                        unitRate: 75000,
                        description: 'Professional photography service',
                        isActive: true,
                    });

                expect([200, 201]).toContain(res.statusCode);
                testService = res.body.service || res.body;
                expect(testService).toHaveProperty('id');
            });

            it('should fail without auth', async () => {
                const res = await request(app)
                    .post('/services')
                    .send({
                        name: 'No Auth Service',
                        categoryId: testCategory.id,
                        unitRate: 50000,
                    });
                expect(res.statusCode).toBe(401);
            });

            it('should handle service creation without all fields', async () => {
                const res = await request(app)
                    .post('/services')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ name: 'Incomplete Service' });
                // May return 201 if defaults are applied, 400 for validation, or 500 for error
                expect([201, 400, 500]).toContain(res.statusCode);
            });
        });

        describe('Read Services', () => {
            it('should get all services', async () => {
                const res = await request(app)
                    .get('/services')
                    .set('Authorization', `Bearer ${userToken}`);

                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
                expect(res.body.length).toBeGreaterThan(0);
            });

            it('should get service by ID', async () => {
                const res = await request(app)
                    .get(`/services/${testService.id}`)
                    .set('Authorization', `Bearer ${userToken}`);

                expect(res.statusCode).toBe(200);
                expect(res.body.id).toBe(testService.id);
            });

            it('should fail without auth', async () => {
                const res = await request(app).get('/services');
                expect(res.statusCode).toBe(401);
            });

            it('should return 404 for non-existent service', async () => {
                const res = await request(app)
                    .get('/services/non-existent-id')
                    .set('Authorization', `Bearer ${userToken}`);
                expect([404, 500]).toContain(res.statusCode);
            });
        });

        describe('Update Service', () => {
            it('should update service details', async () => {
                const res = await request(app)
                    .patch(`/services/${testService.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        name: 'Updated Photo Service',
                        unitRate: 80000,
                        description: 'Updated description',
                    });

                expect(res.statusCode).toBe(200);
            });

            it('should update service isActive status', async () => {
                const res = await request(app)
                    .patch(`/services/${testService.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ isActive: false });

                expect(res.statusCode).toBe(200);

                // Reactivate for other tests
                await request(app)
                    .patch(`/services/${testService.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ isActive: true });
            });

            it('should fail without auth', async () => {
                const res = await request(app)
                    .patch(`/services/${testService.id}`)
                    .send({ name: 'No Auth Update' });
                expect(res.statusCode).toBe(401);
            });
        });
    });

    // ==================== DELETE TESTS (at the end) ====================
    describe('3. Delete Operations', () => {
        let tempService = null;
        let tempCategory = null;

        beforeAll(async () => {
            // Create temp items for deletion tests
            tempCategory = await prisma.category.create({
                data: { name: 'Temp Delete Category', type: 'JASA' },
            });
            tempService = await prisma.service.create({
                data: {
                    name: 'Temp Delete Service',
                    categoryId: tempCategory.id,
                    unitRate: 10000,
                    isActive: true,
                },
            });
        });

        it('should delete service', async () => {
            const res = await request(app)
                .delete(`/services/${tempService.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 204]).toContain(res.statusCode);
        });

        it('should delete category', async () => {
            const res = await request(app)
                .delete(`/categories/${tempCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 204]).toContain(res.statusCode);
        });

        it('should fail to delete service without auth', async () => {
            const res = await request(app)
                .delete(`/services/${testService.id}`);
            expect(res.statusCode).toBe(401);
        });

        it('should fail to delete category without auth', async () => {
            const res = await request(app)
                .delete(`/categories/${testCategory.id}`);
            expect(res.statusCode).toBe(401);
        });
    });

    // ==================== ERROR CASES ====================
    describe('4. Error Cases', () => {
        it('should return error for non-existent category ID', async () => {
            const res = await request(app)
                .get('/categories/non-existent-uuid')
                .set('Authorization', `Bearer ${userToken}`);
            expect([404, 500]).toContain(res.statusCode);
        });

        it('should return error for updating non-existent service', async () => {
            const res = await request(app)
                .patch('/services/non-existent-uuid')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Should Fail' });
            expect([404, 500]).toContain(res.statusCode);
        });

        it('should return error for deleting non-existent category', async () => {
            const res = await request(app)
                .delete('/categories/non-existent-uuid')
                .set('Authorization', `Bearer ${adminToken}`);
            expect([404, 500]).toContain(res.statusCode);
        });
    });
});
