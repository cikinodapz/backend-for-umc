const { getUserDashboard, getAdminDashboard, getAdminBookingTimeSeries } = require('../controllers/dashboardController/dashboard');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    cart: {
      count: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    bookingItem: {
      count: jest.fn(),
    },
    notification: {
      count: jest.fn(),
    },
    feedback: {
      count: jest.fn(),
    },
    payment: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    asset: {
      count: jest.fn(),
    },
    service: {
      count: jest.fn(),
    },
    package: {
      count: jest.fn(),
    },
    category: {
      count: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

describe('Dashboard Controller', () => {
  let prisma;
  let req;
  let res;

  beforeEach(() => {
    prisma = new (require('@prisma/client').PrismaClient)();
    req = {
      user: {},
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

  describe('getUserDashboard', () => {
    it('should return 401 if user not authenticated', async () => {
      req.user = null;

      await getUserDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    });

    it('should return user dashboard data successfully', async () => {
      req.user = { id: '1' };
      const mockUserProfile = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '123456789',
        photoUrl: null,
        role: 'PEMINJAM',
        status: 'AKTIF',
      };
      const mockNextBooking = {
        id: '1',
        startDate: new Date(),
        endDate: new Date(),
        status: 'DIKONFIRMASI',
        totalAmount: 100000,
        items: [],
      };

      prisma.user.findUnique.mockResolvedValue(mockUserProfile);
      prisma.cart.count.mockResolvedValue(2);
      prisma.booking.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(1) // waiting
        .mockResolvedValueOnce(2) // confirmed
        .mockResolvedValueOnce(0) // rejected
        .mockResolvedValueOnce(1) // canceled
        .mockResolvedValueOnce(1); // completed
      prisma.notification.count.mockResolvedValue(3);
      prisma.feedback.count.mockResolvedValue(2);
      prisma.payment.count.mockResolvedValue(1);
      prisma.booking.findFirst.mockResolvedValue(mockNextBooking);
      prisma.bookingItem.count.mockResolvedValue(4);

      await getUserDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        user: mockUserProfile,
        cart: { count: 2 },
        bookings: {
          total: 5,
          waiting: 1,
          confirmed: 2,
          rejected: 0,
          canceled: 1,
          completed: 1,
          nextUpcoming: mockNextBooking,
        },
        assetsBorrowed: 4,
        notifications: { unread: 3 },
        feedback: { count: 2 },
        payments: { pending: 1 },
      });
    });

    it('should handle database errors', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await getUserDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Gagal memuat dashboard user',
        error: 'Database error',
      });
    });
  });

  describe('getAdminDashboard', () => {
    it('should return 403 if user is not admin', async () => {
      req.user = { role: 'PEMINJAM' };

      await getAdminDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: Admin only' });
    });

    it('should return admin dashboard data successfully', async () => {
      req.user = { role: 'ADMIN' };

      // Mock all the count and aggregate calls
      prisma.user.count
        .mockResolvedValueOnce(100) // total users
        .mockResolvedValueOnce(95); // active users

      prisma.asset.count
        .mockResolvedValueOnce(50) // total assets
        .mockResolvedValueOnce(30) // available
        .mockResolvedValueOnce(15) // borrowed
        .mockResolvedValueOnce(5); // inactive

      prisma.service.count.mockResolvedValue(10);
      prisma.package.count.mockResolvedValue(5);
      prisma.category.count.mockResolvedValue(8);

      prisma.booking.count
        .mockResolvedValueOnce(20) // waiting
        .mockResolvedValueOnce(15) // confirmed
        .mockResolvedValueOnce(3) // rejected
        .mockResolvedValueOnce(2) // canceled
        .mockResolvedValueOnce(25); // completed

      prisma.payment.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(30) // paid
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(1); // refunded

      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 5000000 } });
      prisma.feedback.count.mockResolvedValue(50);
      prisma.notification.count.mockResolvedValue(10);

      prisma.booking.findMany.mockResolvedValue([
        {
          id: '1',
          status: 'DIKONFIRMASI',
          type: 'PEMINJAMAN',
          totalAmount: 100000,
          createdAt: new Date(),
          user: { id: '1', name: 'User 1' },
        },
      ]);

      prisma.payment.findMany.mockResolvedValue([
        {
          id: '1',
          amount: 100000,
          status: 'PAID',
          method: 'TRANSFER',
          createdAt: new Date(),
          booking: { id: '1', user: { id: '1', name: 'User 1' } },
        },
      ]);

      await getAdminDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        totals: {
          users: { total: 100, active: 95 },
          assets: {
            total: 50,
            available: 30,
            borrowed: 15,
            inactive: 5,
          },
          services: { active: 10 },
          packages: 5,
          categories: 8,
        },
        bookings: {
          waiting: 20,
          confirmed: 15,
          rejected: 3,
          canceled: 2,
          completed: 25,
        },
        payments: {
          pending: 5,
          paid: 30,
          failed: 2,
          refunded: 1,
          revenuePaid: 5000000,
        },
        feedback: { total: 50 },
        notifications: { unreadAllUsers: 10 },
        recent: {
          bookings: [
            {
              id: '1',
              status: 'DIKONFIRMASI',
              type: 'PEMINJAMAN',
              totalAmount: 100000,
              createdAt: expect.any(Date),
              user: { id: '1', name: 'User 1' },
            },
          ],
          payments: [
            {
              id: '1',
              amount: 100000,
              status: 'PAID',
              method: 'TRANSFER',
              createdAt: expect.any(Date),
              booking: { id: '1', user: { id: '1', name: 'User 1' } },
            },
          ],
        },
      });
    });

    it('should handle database errors', async () => {
      req.user = { role: 'ADMIN' };
      prisma.user.count.mockRejectedValue(new Error('Database error'));

      await getAdminDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Gagal memuat dashboard admin',
        error: 'Database error',
      });
    });
  });

  describe('getAdminBookingTimeSeries', () => {
    it('should return 403 if user is not admin', async () => {
      req.user = { role: 'PEMINJAM' };

      await getAdminBookingTimeSeries(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: Admin only' });
    });

    it('should return booking time series data successfully', async () => {
      req.user = { role: 'ADMIN' };
      req.query = { start: '2024-01-01T00:00:00.000Z', end: '2024-01-03T00:00:00.000Z', interval: 'day' };

      const mockBookings = [
        {
          createdAt: new Date('2024-01-01T10:00:00.000Z'),
          status: 'DIKONFIRMASI',
          totalAmount: 100000,
        },
        {
          createdAt: new Date('2024-01-02T15:00:00.000Z'),
          status: 'MENUNGGU',
          totalAmount: 50000,
        },
      ];

      prisma.booking.findMany.mockResolvedValue(mockBookings);

      await getAdminBookingTimeSeries(req, res);

      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date('2024-01-01T00:00:00.000Z'),
            lte: new Date('2024-01-03T00:00:00.000Z'),
          },
        },
        select: { createdAt: true, status: true, totalAmount: true },
        orderBy: { createdAt: 'asc' },
      });

      expect(res.json).toHaveBeenCalledWith({
        range: {
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-01-03T00:00:00.000Z',
          interval: 'day',
        },
        timeline: expect.any(Array),
      });
    });

    it('should handle database errors', async () => {
      req.user = { role: 'ADMIN' };
      prisma.booking.findMany.mockRejectedValue(new Error('Database error'));

      await getAdminBookingTimeSeries(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Gagal memuat statistik time series',
        error: 'Database error',
      });
    });
  });
});
