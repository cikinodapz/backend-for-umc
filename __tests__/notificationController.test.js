// notificationController.test.js
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { getUserNotifications, markAsRead } = require('./notification');


describe('Notification Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { id: 'user1' },
      query: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  // ---------------------------
  // TEST: getUserNotifications
  // ---------------------------
  describe('getUserNotifications()', () => {
    it('harus mengembalikan semua notifikasi tanpa filter', async () => {
      const mockNotifications = [
        { id: 1, message: 'Test', readAt: null },
        { id: 2, message: 'Lainnya', readAt: new Date() },
      ];

      prisma.notification.findMany.mockResolvedValue(mockNotifications);

      await getUserNotifications(req, res);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user1' } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        notifications: mockNotifications,
        total: mockNotifications.length,
      });
    });

    it('harus mengembalikan notifikasi yang sudah dibaca ketika read=true', async () => {
      req.query.read = 'true';
      prisma.notification.findMany.mockResolvedValue([{ id: 2, readAt: new Date() }]);

      await getUserNotifications(req, res);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user1', readAt: { not: null } },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('harus mengembalikan 500 kalau ada error', async () => {
      prisma.notification.findMany.mockRejectedValue(new Error('DB error'));

      await getUserNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  // -----------------------
  // TEST: markAsRead
  // -----------------------
  describe('markAsRead()', () => {
    it('harus menandai satu notifikasi sebagai dibaca', async () => {
      req.params.id = 'notif1';
      prisma.notification.findUnique.mockResolvedValue({ id: 'notif1', userId: 'user1', readAt: null });
      prisma.notification.update.mockResolvedValue({});

      await markAsRead(req, res);

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif1' } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Notifikasi berhasil ditandai sebagai dibaca',
      });
    });

    it('harus return 404 kalau notifikasi tidak ditemukan', async () => {
      req.params.id = 'notif1';
      prisma.notification.findUnique.mockResolvedValue(null);

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Notifikasi tidak ditemukan' });
    });

    it('harus menandai semua notifikasi kalau id tidak ada', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      await markAsRead(req, res);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user1', readAt: null } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Semua notifikasi berhasil ditandai sebagai dibaca',
      });
    });
  });
});
