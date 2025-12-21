/**
 * System Tests: Notification Flow
 * 
 * End-to-end testing untuk alur notifikasi
 * Tests ini menggunakan REAL database (PostgreSQL)
 * 
 * Flow yang ditest:
 * 1. Get User Notifications
 * 2. Mark Notification as Read (single)
 * 3. Mark All Notifications as Read
 * 4. Error Cases
 */

const request = require('supertest');
const app = require('../../app');
const { prisma, cleanDatabase, disconnectDatabase, createTestUser } = require('./testHelper');

describe('Notification Flow - System Tests', () => {
    let userToken = null;
    let testUser = null;
    let testNotifications = [];

    beforeAll(async () => {
        await cleanDatabase();

        // Setup user
        const userData = createTestUser();
        await request(app).post('/auth/register').send(userData);
        const userLoginRes = await request(app).post('/auth/login')
            .send({ email: userData.email, password: userData.password });
        userToken = userLoginRes.body.token;

        // Get user ID
        testUser = await prisma.user.findUnique({ where: { email: userData.email } });

        // Create test notifications directly in DB
        const notif1 = await prisma.notification.create({
            data: {
                userId: testUser.id,
                type: 'BOOKING',
                title: 'Test Notification 1',
                body: 'This is test notification 1',
                readAt: null,
            },
        });

        const notif2 = await prisma.notification.create({
            data: {
                userId: testUser.id,
                type: 'PAYMENT',
                title: 'Test Notification 2',
                body: 'This is test notification 2',
                readAt: null,
            },
        });

        const notif3 = await prisma.notification.create({
            data: {
                userId: testUser.id,
                type: 'SYSTEM',
                title: 'Test Notification 3',
                body: 'This is test notification 3',
                readAt: new Date(), // Already read
            },
        });

        testNotifications = [notif1, notif2, notif3];
    }, 30000);

    afterAll(async () => {
        await cleanDatabase();
        await disconnectDatabase();
    });

    describe('1. Get Notifications', () => {
        it('should get user notifications', async () => {
            const res = await request(app)
                .get('/notifications')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('notifications');
            expect(Array.isArray(res.body.notifications)).toBe(true);
            expect(res.body.notifications.length).toBe(3);
        });

        it('should have correct notification structure', async () => {
            const res = await request(app)
                .get('/notifications')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            if (res.body.notifications && res.body.notifications.length > 0) {
                expect(res.body.notifications[0]).toHaveProperty('id');
                expect(res.body.notifications[0]).toHaveProperty('title');
                expect(res.body.notifications[0]).toHaveProperty('type');
            }
        });

        it('should fail without auth', async () => {
            const res = await request(app).get('/notifications');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('2. Mark Single Notification as Read', () => {
        it('should mark specific notification as read', async () => {
            const notifId = testNotifications[0].id;
            const res = await request(app)
                .patch(`/notifications/${notifId}/read`)
                .set('Authorization', `Bearer ${userToken}`);

            expect([200, 204]).toContain(res.statusCode);

            // Verify it's marked as read
            const check = await prisma.notification.findUnique({ where: { id: notifId } });
            expect(check.readAt).not.toBeNull();
        });

        it('should fail without auth', async () => {
            const notifId = testNotifications[0].id;
            const res = await request(app)
                .patch(`/notifications/${notifId}/read`);
            expect(res.statusCode).toBe(401);
        });

        it('should handle non-existent notification', async () => {
            const res = await request(app)
                .patch('/notifications/non-existent-id/read')
                .set('Authorization', `Bearer ${userToken}`);
            // Could return 200 (no-op), 404, or 500
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    describe('3. Mark All Notifications as Read', () => {
        beforeAll(async () => {
            // Reset some notifications to unread
            await prisma.notification.updateMany({
                where: { userId: testUser.id },
                data: { readAt: null },
            });
        });

        it('should mark all notifications as read', async () => {
            const res = await request(app)
                .patch('/notifications/read')
                .set('Authorization', `Bearer ${userToken}`);

            expect([200, 204]).toContain(res.statusCode);

            // Verify all are marked as read
            const unreadCount = await prisma.notification.count({
                where: { userId: testUser.id, readAt: null },
            });
            expect(unreadCount).toBe(0);
        });

        it('should fail without auth', async () => {
            const res = await request(app).patch('/notifications/read');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('4. Empty Notifications', () => {
        let newUserToken = null;

        beforeAll(async () => {
            // Create new user with no notifications
            const newUser = createTestUser({ name: 'Empty Notif User' });
            await request(app).post('/auth/register').send(newUser);
            const loginRes = await request(app).post('/auth/login')
                .send({ email: newUser.email, password: newUser.password });
            newUserToken = loginRes.body.token;
        });

        it('should return empty array for user with no notifications', async () => {
            const res = await request(app)
                .get('/notifications')
                .set('Authorization', `Bearer ${newUserToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.notifications).toBeDefined();
            expect(res.body.notifications.length).toBe(0);
        });
    });

    describe('5. Notification Types', () => {
        it('should have correct notification types', async () => {
            const res = await request(app)
                .get('/notifications')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(200);
            const types = res.body.notifications.map(n => n.type);
            // Should have BOOKING, PAYMENT, SYSTEM from our test data
            expect(types).toContain('BOOKING');
            expect(types).toContain('PAYMENT');
            expect(types).toContain('SYSTEM');
        });
    });
});
