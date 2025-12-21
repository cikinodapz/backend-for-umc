const {
    getBookingsByUser,
    createBookingFromCart,
    createBooking,
    updateBooking,
    cancelBooking,
    getAllBookings,
    getBookingById,
    confirmBooking,
    rejectBooking,
    completeBooking,
} = require('../controllers/bookingController/booking');

// Mock mailer
jest.mock('../services/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true),
    buildAdminBookingEmail: jest.fn().mockReturnValue({ subject: 'test', text: 'test', html: 'test' }),
    buildUserBookingStatusEmail: jest.fn().mockReturnValue({ subject: 'test', text: 'test', html: 'test' }),
    buildAdminBookingCompletedEmail: jest.fn().mockReturnValue({ subject: 'test', text: 'test', html: 'test' }),
}));

// Mock PrismaClient
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        booking: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        cart: {
            findMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        service: {
            findUnique: jest.fn(),
        },
        package: {
            findUnique: jest.fn(),
        },
        user: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        notification: {
            create: jest.fn(),
        },
        bookingItem: {
            update: jest.fn(),
        },
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
        NotificationType: {
            BOOKING: 'BOOKING',
        },
    };
});

describe('Booking Controller', () => {
    let prisma;
    let req;
    let res;

    beforeEach(() => {
        prisma = new (require('@prisma/client').PrismaClient)();
        req = {
            user: { id: 'user1', role: 'PEMINJAM' },
            params: {},
            body: {},
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getBookingsByUser', () => {
        it('should return bookings for user', async () => {
            const mockBookings = [
                { id: 'b1', userId: 'user1', status: 'MENUNGGU', items: [], payments: [] },
            ];
            prisma.booking.findMany.mockResolvedValue(mockBookings);

            await getBookingsByUser(req, res);

            expect(prisma.booking.findMany).toHaveBeenCalledWith({
                where: { userId: 'user1' },
                include: expect.any(Object),
                orderBy: { createdAt: 'desc' },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockBookings);
        });

        it('should return 500 on database error', async () => {
            prisma.booking.findMany.mockRejectedValue(new Error('Database error'));

            await getBookingsByUser(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('createBookingFromCart', () => {
        it('should return 400 if dates are missing', async () => {
            req.body = {};

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tanggal mulai dan akhir diperlukan' });
        });

        it('should return 400 if start date is after end date', async () => {
            req.body = { startDate: '2024-01-10', endDate: '2024-01-05' };

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir' });
        });

        it('should return 400 if cart is empty', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-05' };
            prisma.cart.findMany.mockResolvedValue([]);

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Keranjang kosong, tambahkan item terlebih dahulu' });
        });

        it('should return 400 if service is inactive', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-05' };
            prisma.cart.findMany.mockResolvedValue([
                {
                    serviceId: 's1',
                    quantity: 1,
                    service: { id: 's1', isActive: false, name: 'Inactive Service', unitRate: { toNumber: () => 10000 } },
                    package: null,
                },
            ]);

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Service Inactive Service tidak aktif' });
        });

        it('should create booking successfully from cart', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-05', notes: 'Test notes' };
            prisma.cart.findMany.mockResolvedValue([
                {
                    serviceId: 's1',
                    packageId: null,
                    quantity: 2,
                    notes: 'Item note',
                    service: { id: 's1', isActive: true, name: 'Service 1', unitRate: { toNumber: () => 10000 } },
                    package: null,
                },
            ]);
            prisma.booking.create.mockResolvedValue({
                id: 'b1',
                userId: 'user1',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-05'),
                totalAmount: 100000,
                status: 'MENUNGGU',
                items: [],
            });
            prisma.cart.deleteMany.mockResolvedValue({});
            prisma.user.findMany.mockResolvedValue([{ id: 'admin1', email: 'admin@test.com' }]);
            prisma.user.findUnique.mockResolvedValue({ name: 'Test User', email: 'user@test.com' });

            await createBookingFromCart(req, res);

            expect(prisma.booking.create).toHaveBeenCalled();
            expect(prisma.cart.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user1' } });
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should create booking with package rate', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-01' };
            prisma.cart.findMany.mockResolvedValue([
                {
                    serviceId: 's1',
                    packageId: 'p1',
                    quantity: 1,
                    service: { id: 's1', isActive: true, name: 'Service 1', unitRate: { toNumber: () => 10000 } },
                    package: { id: 'p1', unitRate: { toNumber: () => 8000 } },
                },
            ]);
            prisma.booking.create.mockResolvedValue({ id: 'b1', items: [] });
            prisma.cart.deleteMany.mockResolvedValue({});
            prisma.user.findMany.mockResolvedValue([]);

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 500 on database error', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-05' };
            prisma.cart.findMany.mockRejectedValue(new Error('Database error'));

            await createBookingFromCart(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('createBooking', () => {
        it('should return 400 if dates are missing', async () => {
            req.body = { items: [] };

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tanggal mulai dan akhir diperlukan' });
        });

        it('should return 400 if start date is after end date', async () => {
            req.body = { startDate: '2024-01-10', endDate: '2024-01-05', items: [] };

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir' });
        });

        it('should return 400 if no items provided', async () => {
            req.body = { startDate: '2024-01-01', endDate: '2024-01-05', items: [] };

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Minimal satu item jasa diperlukan' });
        });

        it('should return 400 if item has no serviceId', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ quantity: 1 }],
            };

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Service ID diperlukan untuk setiap item' });
        });

        it('should return 404 if service not found', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1', quantity: 1 }],
            };
            prisma.service.findUnique.mockResolvedValue(null);

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Service s1 tidak ditemukan' });
        });

        it('should return 400 if service is inactive', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1', quantity: 1 }],
            };
            prisma.service.findUnique.mockResolvedValue({
                id: 's1',
                isActive: false,
                name: 'Inactive Service',
                unitRate: { toNumber: () => 10000 },
            });

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Service Inactive Service tidak aktif' });
        });

        it('should return 404 if package not found', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1', packageId: 'p1', quantity: 1 }],
            };
            prisma.service.findUnique.mockResolvedValue({
                id: 's1',
                isActive: true,
                name: 'Service',
                unitRate: { toNumber: () => 10000 },
            });
            prisma.package.findUnique.mockResolvedValue(null);

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Paket p1 tidak ditemukan' });
        });

        it('should return 400 if package does not match service', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1', packageId: 'p1', quantity: 1 }],
            };
            prisma.service.findUnique.mockResolvedValue({
                id: 's1',
                isActive: true,
                unitRate: { toNumber: () => 10000 },
            });
            prisma.package.findUnique.mockResolvedValue({
                id: 'p1',
                serviceId: 's2', // Different service
                unitRate: { toNumber: () => 8000 },
            });

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Paket tidak sesuai dengan service' });
        });

        it('should create booking successfully', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                notes: 'Booking notes',
                items: [{ serviceId: 's1', quantity: 2, notes: 'Item notes' }],
            };
            prisma.service.findUnique.mockResolvedValue({
                id: 's1',
                isActive: true,
                name: 'Service 1',
                unitRate: { toNumber: () => 10000 },
            });
            prisma.booking.create.mockResolvedValue({
                id: 'b1',
                userId: 'user1',
                status: 'MENUNGGU',
                items: [],
            });
            prisma.user.findMany.mockResolvedValue([]);

            await createBooking(req, res);

            expect(prisma.booking.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should create booking with package rate', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1', packageId: 'p1', quantity: 1 }],
            };
            prisma.service.findUnique.mockResolvedValue({
                id: 's1',
                isActive: true,
                name: 'Service 1',
                unitRate: { toNumber: () => 10000 },
            });
            prisma.package.findUnique.mockResolvedValue({
                id: 'p1',
                serviceId: 's1', // Matching service
                unitRate: { toNumber: () => 8000 },
            });
            prisma.booking.create.mockResolvedValue({
                id: 'b1',
                userId: 'user1',
                status: 'MENUNGGU',
                items: [],
            });
            prisma.user.findMany.mockResolvedValue([]);

            await createBooking(req, res);

            expect(prisma.booking.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 500 on database error', async () => {
            req.body = {
                startDate: '2024-01-01',
                endDate: '2024-01-05',
                items: [{ serviceId: 's1' }],
            };
            prisma.service.findUnique.mockRejectedValue(new Error('Database error'));

            await createBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('updateBooking', () => {
        it('should return 404 if booking not found', async () => {
            req.params = { id: 'b1' };
            req.body = { notes: 'Updated' };
            prisma.booking.findFirst.mockResolvedValue(null);

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking tidak ditemukan' });
        });

        it('should return 400 if booking is not in MENUNGGU status', async () => {
            req.params = { id: 'b1' };
            req.body = { notes: 'Updated' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'b1', status: 'DIKONFIRMASI', items: [] });

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Hanya booking menunggu yang bisa diupdate' });
        });

        it('should return 400 if new start date is after end date', async () => {
            req.params = { id: 'b1' };
            req.body = { startDate: '2024-01-10', endDate: '2024-01-05' };
            prisma.booking.findFirst.mockResolvedValue({
                id: 'b1',
                status: 'MENUNGGU',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-05'),
                items: [],
            });

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir' });
        });

        it('should update booking successfully with recalculation', async () => {
            req.params = { id: 'b1' };
            req.body = { startDate: '2024-01-01', endDate: '2024-01-10', notes: 'Updated notes' };
            prisma.booking.findFirst.mockResolvedValue({
                id: 'b1',
                status: 'MENUNGGU',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-05'),
                items: [
                    { id: 'i1', unitPrice: { toNumber: () => 10000 }, quantity: 1 },
                ],
            });
            prisma.bookingItem.update.mockResolvedValue({});
            prisma.booking.update.mockResolvedValue({ id: 'b1', items: [] });

            await updateBooking(req, res);

            expect(prisma.bookingItem.update).toHaveBeenCalled();
            expect(prisma.booking.update).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should update booking notes only', async () => {
            req.params = { id: 'b1' };
            req.body = { notes: 'Only notes updated' };
            prisma.booking.findFirst.mockResolvedValue({
                id: 'b1',
                status: 'MENUNGGU',
                items: [],
            });
            prisma.booking.update.mockResolvedValue({ id: 'b1', items: [] });

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.params = { id: 'b1' };
            req.body = { notes: 'Updated' };
            prisma.booking.findFirst.mockRejectedValue(new Error('Database error'));

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should return 404 on P2025 error', async () => {
            req.params = { id: 'b1' };
            req.body = { notes: 'Updated' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'b1', status: 'MENUNGGU', items: [] });
            const error = new Error('Not found');
            error.code = 'P2025';
            prisma.booking.update.mockRejectedValue(error);

            await updateBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('cancelBooking', () => {
        it('should return 404 if booking not found', async () => {
            req.params = { id: 'b1' };
            prisma.booking.findFirst.mockResolvedValue(null);

            await cancelBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 400 if booking cannot be canceled', async () => {
            req.params = { id: 'b1' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'b1', status: 'SELESAI' });

            await cancelBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Hanya booking menunggu atau dikonfirmasi yang bisa dibatalkan' });
        });

        it('should cancel booking successfully', async () => {
            req.params = { id: 'b1' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'b1', status: 'MENUNGGU' });
            prisma.booking.update.mockResolvedValue({});

            await cancelBooking(req, res);

            expect(prisma.booking.update).toHaveBeenCalledWith({
                where: { id: 'b1' },
                data: expect.objectContaining({ status: 'DIBATALKAN' }),
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.params = { id: 'b1' };
            prisma.booking.findFirst.mockRejectedValue(new Error('Database error'));

            await cancelBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should return 404 on P2025 error code', async () => {
            req.params = { id: 'b1' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'b1', status: 'MENUNGGU' });
            const error = new Error('Not found');
            error.code = 'P2025';
            prisma.booking.update.mockRejectedValue(error);

            await cancelBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking tidak ditemukan' });
        });
    });

    describe('getAllBookings', () => {
        it('should return 403 if not admin', async () => {
            req.user.role = 'PEMINJAM';

            await getAllBookings(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Akses ditolak, hanya admin' });
        });

        it('should return all bookings for admin', async () => {
            req.user.role = 'ADMIN';
            prisma.booking.findMany.mockResolvedValue([{ id: 'b1' }]);

            await getAllBookings(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user.role = 'ADMIN';
            prisma.booking.findMany.mockRejectedValue(new Error('Database error'));

            await getAllBookings(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getBookingById', () => {
        it('should return 403 if not admin', async () => {
            req.user.role = 'PEMINJAM';
            req.params = { id: 'b1' };

            await getBookingById(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 404 if booking not found', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await getBookingById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return booking for admin', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1' });

            await getBookingById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await getBookingById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('confirmBooking', () => {
        it('should return 403 if not admin', async () => {
            req.user.role = 'PEMINJAM';
            req.params = { id: 'b1' };

            await confirmBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 404 if booking not found', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await confirmBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 400 if booking is not MENUNGGU', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: 'DIKONFIRMASI' });

            await confirmBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should confirm booking successfully', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { id: 'b1' };
            req.body = { notes: 'Approved' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'MENUNGGU', notes: 'Original' });
            prisma.booking.update.mockResolvedValue({ id: 'b1', items: [] });
            prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'user@test.com' });

            await confirmBooking(req, res);

            expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'DIKONFIRMASI' }),
            }));
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await confirmBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should return 404 on P2025 error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'MENUNGGU' });
            const error = new Error('Not found');
            error.code = 'P2025';
            prisma.booking.update.mockRejectedValue(error);

            await confirmBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('rejectBooking', () => {
        it('should return 403 if not admin', async () => {
            req.user.role = 'PEMINJAM';
            req.params = { id: 'b1' };

            await rejectBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 404 if booking not found', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await rejectBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 400 if booking is not MENUNGGU', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: 'SELESAI' });

            await rejectBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should reject booking successfully with reason', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { id: 'b1' };
            req.body = { reason: 'Not available' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'MENUNGGU', notes: null });
            prisma.booking.update.mockResolvedValue({ id: 'b1', items: [] });
            prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'user@test.com' });

            await rejectBooking(req, res);

            expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'DITOLAK' }),
            }));
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await rejectBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should return 404 on P2025 error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'MENUNGGU' });
            const error = new Error('Not found');
            error.code = 'P2025';
            prisma.booking.update.mockRejectedValue(error);

            await rejectBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('completeBooking', () => {
        it('should return 403 if not admin', async () => {
            req.user.role = 'PEMINJAM';
            req.params = { id: 'b1' };

            await completeBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 404 if booking not found', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await completeBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 400 if booking is not DIKONFIRMASI', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', status: 'MENUNGGU' });

            await completeBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should complete booking successfully', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'DIKONFIRMASI' });
            prisma.booking.update.mockResolvedValue({ id: 'b1', items: [] });
            prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'user@test.com' });
            prisma.user.findMany.mockResolvedValue([{ email: 'admin@test.com' }]);

            await completeBooking(req, res);

            expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'SELESAI' }),
            }));
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await completeBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should return 404 on P2025 error', async () => {
            req.user.role = 'ADMIN';
            req.params = { id: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'DIKONFIRMASI' });
            const error = new Error('Not found');
            error.code = 'P2025';
            prisma.booking.update.mockRejectedValue(error);

            await completeBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });
});
