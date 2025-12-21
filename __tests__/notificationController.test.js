const {
  getUserNotifications,
  markAsRead,
} = require('../controllers/notificationController/notification');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

describe('Notification Controller', () => {
  let prisma;
  let req;
  let res;

  beforeEach(() => {
    prisma = new (require('@prisma/client').PrismaClient)();
    req = {
      user: { id: 'user1' },
      params: {},
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserNotifications', () => {
    it('should return all notifications without filter', async () => {
      const mockNotifications = [
        { id: 'n1', userId: 'user1', message: 'Notification 1', sentAt: new Date(), readAt: null },
        { id: 'n2', userId: 'user1', message: 'Notification 2', sentAt: new Date(), readAt: new Date() },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);

      await getUserNotifications(req, res);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        orderBy: { sentAt: 'desc' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        notifications: mockNotifications,
        total: 2,
      });
    });

    it('should return only read notifications when read=true', async () => {
      req.query = { read: 'true' };
      const mockNotifications = [
        { id: 'n2', userId: 'user1', message: 'Notification 2', sentAt: new Date(), readAt: new Date() },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);

      await getUserNotifications(req, res);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1', readAt: { not: null } },
        orderBy: { sentAt: 'desc' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        notifications: mockNotifications,
        total: 1,
      });
    });

    it('should return only unread notifications when read=false', async () => {
      req.query = { read: 'false' };
      const mockNotifications = [
        { id: 'n1', userId: 'user1', message: 'Notification 1', sentAt: new Date(), readAt: null },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);

      await getUserNotifications(req, res);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1', readAt: null },
        orderBy: { sentAt: 'desc' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        notifications: mockNotifications,
        total: 1,
      });
    });

    it('should return 500 on database error', async () => {
      prisma.notification.findMany.mockRejectedValue(new Error('Database error'));

      await getUserNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('markAsRead', () => {
    describe('mark single notification', () => {
      it('should mark single notification as read successfully', async () => {
        req.params = { id: 'n1' };
        const mockNotification = { id: 'n1', userId: 'user1', readAt: null };
        prisma.notification.findUnique.mockResolvedValue(mockNotification);
        prisma.notification.update.mockResolvedValue({ ...mockNotification, readAt: new Date() });

        await markAsRead(req, res);

        expect(prisma.notification.findUnique).toHaveBeenCalledWith({ where: { id: 'n1' } });
        expect(prisma.notification.update).toHaveBeenCalledWith({
          where: { id: 'n1' },
          data: { readAt: expect.any(Date) },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'Notifikasi berhasil ditandai sebagai dibaca' });
      });

      it('should return 404 if notification not found', async () => {
        req.params = { id: 'nonexistent' };
        prisma.notification.findUnique.mockResolvedValue(null);

        await markAsRead(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'Notifikasi tidak ditemukan' });
      });

      it('should return 404 if notification belongs to different user', async () => {
        req.params = { id: 'n1' };
        const mockNotification = { id: 'n1', userId: 'otherUser', readAt: null };
        prisma.notification.findUnique.mockResolvedValue(mockNotification);

        await markAsRead(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'Notifikasi tidak ditemukan' });
      });

      it('should return 400 if notification already read', async () => {
        req.params = { id: 'n1' };
        const mockNotification = { id: 'n1', userId: 'user1', readAt: new Date() };
        prisma.notification.findUnique.mockResolvedValue(mockNotification);

        await markAsRead(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'Notifikasi sudah dibaca' });
      });
    });

    describe('mark all notifications', () => {
      it('should mark all unread notifications as read successfully', async () => {
        req.params = {}; // No id param

        await markAsRead(req, res);

        expect(prisma.notification.updateMany).toHaveBeenCalledWith({
          where: { userId: 'user1', readAt: null },
          data: { readAt: expect.any(Date) },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'Semua notifikasi berhasil ditandai sebagai dibaca' });
      });

      it('should mark all when id is undefined', async () => {
        req.params = { id: undefined };

        await markAsRead(req, res);

        expect(prisma.notification.updateMany).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
      });

      it('should mark all when id is empty string', async () => {
        req.params = { id: '' };

        await markAsRead(req, res);

        expect(prisma.notification.updateMany).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
      });
    });

    it('should return 500 on database error for single notification', async () => {
      req.params = { id: 'n1' };
      prisma.notification.findUnique.mockRejectedValue(new Error('Database error'));

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });

    it('should return 500 on database error for mark all', async () => {
      req.params = {};
      prisma.notification.updateMany.mockRejectedValue(new Error('Database error'));

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });
});
