const {
    createFeedback,
    getMyFeedbacks,
    getAllFeedbacks,
    getFeedbackByBooking,
    getMyFeedbackDetailByBooking,
} = require('../controllers/feedbackController/feedback');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        feedback: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
        },
        booking: {
            findFirst: jest.fn(),
        },
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
    };
});

describe('Feedback Controller', () => {
    let prisma;
    let req;
    let res;

    beforeEach(() => {
        prisma = new (require('@prisma/client').PrismaClient)();
        req = {
            user: { id: 'user1' },
            params: {},
            body: {},
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

    describe('getMyFeedbackDetailByBooking', () => {
        it('should return 400 if bookingId is missing', async () => {
            req.params = {};

            await getMyFeedbackDetailByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'bookingId diperlukan' });
        });

        it('should return 404 if feedback not found', async () => {
            req.params = { bookingId: 'booking1' };
            prisma.feedback.findFirst.mockResolvedValue(null);

            await getMyFeedbackDetailByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Feedback tidak ditemukan untuk booking ini' });
        });

        it('should return feedback detail successfully', async () => {
            req.params = { bookingId: 'booking1' };
            const mockFeedback = {
                id: 'fb1',
                rating: 5,
                comment: 'Great service',
                createdAt: new Date('2024-01-01'),
                booking: {
                    id: 'booking1',
                    startDate: new Date('2024-01-01'),
                    endDate: new Date('2024-01-03'),
                    totalAmount: 100000,
                    status: 'SELESAI',
                    user: { id: 'user1', name: 'Test User', email: 'test@test.com' },
                    items: [
                        { subtotal: 50000 },
                        { subtotal: 50000 },
                    ],
                    payments: [
                        { status: 'PAID' },
                    ],
                },
                user: { id: 'user1', name: 'Test User', email: 'test@test.com' },
            };
            prisma.feedback.findFirst.mockResolvedValue(mockFeedback);

            await getMyFeedbackDetailByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                feedback: expect.objectContaining({
                    id: 'fb1',
                    rating: 5,
                }),
                booking: expect.objectContaining({
                    id: 'booking1',
                }),
                summary: expect.objectContaining({
                    durationDays: 3,
                    subtotalSum: 100000,
                    paymentCount: 1,
                    latestPaymentStatus: 'PAID',
                }),
            }));
        });

        it('should handle booking without dates', async () => {
            req.params = { bookingId: 'booking1' };
            const mockFeedback = {
                id: 'fb1',
                rating: 4,
                comment: 'Good',
                createdAt: new Date(),
                booking: {
                    id: 'booking1',
                    startDate: null,
                    endDate: null,
                    totalAmount: 50000,
                    status: 'SELESAI',
                    user: { id: 'user1', name: 'Test', email: 'test@test.com' },
                    items: [],
                    payments: [],
                },
                user: { id: 'user1', name: 'Test', email: 'test@test.com' },
            };
            prisma.feedback.findFirst.mockResolvedValue(mockFeedback);

            await getMyFeedbackDetailByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const result = res.json.mock.calls[0][0];
            expect(result.summary.durationDays).toBeNull();
            expect(result.summary.latestPaymentStatus).toBeNull();
        });

        it('should return 500 on database error', async () => {
            req.params = { bookingId: 'booking1' };
            prisma.feedback.findFirst.mockRejectedValue(new Error('Database error'));

            await getMyFeedbackDetailByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('createFeedback', () => {
        it('should return 400 if bookingId is missing', async () => {
            req.body = { rating: 5, comment: 'Great' };

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'bookingId diperlukan' });
        });

        it('should return 400 if rating is invalid (too low)', async () => {
            req.body = { bookingId: 'booking1', rating: 0, comment: 'Bad' };

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'rating harus 1-5' });
        });

        it('should return 400 if rating is invalid (too high)', async () => {
            req.body = { bookingId: 'booking1', rating: 6, comment: 'Excellent' };

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'rating harus 1-5' });
        });

        it('should return 400 if rating is not a number', async () => {
            req.body = { bookingId: 'booking1', rating: 'five', comment: 'Good' };

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'rating harus 1-5' });
        });

        it('should return 404 if booking not found', async () => {
            req.body = { bookingId: 'booking1', rating: 5, comment: 'Great' };
            prisma.booking.findFirst.mockResolvedValue(null);

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking tidak ditemukan' });
        });

        it('should return 400 if booking is not completed', async () => {
            req.body = { bookingId: 'booking1', rating: 5, comment: 'Great' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'booking1', status: 'DIKONFIRMASI' });

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Feedback hanya bisa untuk booking yang sudah selesai' });
        });

        it('should return 409 if feedback already exists', async () => {
            req.body = { bookingId: 'booking1', rating: 5, comment: 'Great' };
            prisma.booking.findFirst.mockResolvedValue({ id: 'booking1', status: 'SELESAI' });
            prisma.feedback.findFirst.mockResolvedValue({ id: 'existing-fb' });

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({ message: 'Feedback untuk booking ini sudah ada' });
        });

        it('should create feedback successfully', async () => {
            req.body = { bookingId: 'booking1', rating: 5, comment: 'Excellent service!' };
            const mockNewFeedback = {
                id: 'fb1',
                bookingId: 'booking1',
                userId: 'user1',
                rating: 5,
                comment: 'Excellent service!',
            };
            prisma.booking.findFirst.mockResolvedValue({ id: 'booking1', status: 'SELESAI' });
            prisma.feedback.findFirst.mockResolvedValue(null);
            prisma.feedback.create.mockResolvedValue(mockNewFeedback);

            await createFeedback(req, res);

            expect(prisma.feedback.create).toHaveBeenCalledWith({
                data: {
                    bookingId: 'booking1',
                    userId: 'user1',
                    rating: 5,
                    comment: 'Excellent service!',
                },
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Feedback berhasil dibuat',
                feedback: mockNewFeedback,
            });
        });

        it('should create feedback without comment', async () => {
            req.body = { bookingId: 'booking1', rating: 4 };
            const mockNewFeedback = {
                id: 'fb1',
                bookingId: 'booking1',
                userId: 'user1',
                rating: 4,
                comment: null,
            };
            prisma.booking.findFirst.mockResolvedValue({ id: 'booking1', status: 'SELESAI' });
            prisma.feedback.findFirst.mockResolvedValue(null);
            prisma.feedback.create.mockResolvedValue(mockNewFeedback);

            await createFeedback(req, res);

            expect(prisma.feedback.create).toHaveBeenCalledWith({
                data: {
                    bookingId: 'booking1',
                    userId: 'user1',
                    rating: 4,
                    comment: null,
                },
            });
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 500 on database error', async () => {
            req.body = { bookingId: 'booking1', rating: 5, comment: 'Great' };
            prisma.booking.findFirst.mockRejectedValue(new Error('Database error'));

            await createFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getMyFeedbacks', () => {
        it('should return user feedbacks successfully', async () => {
            const mockFeedbacks = [
                {
                    id: 'fb1',
                    rating: 5,
                    comment: 'Great',
                    booking: {
                        id: 'booking1',
                        startDate: new Date(),
                        endDate: new Date(),
                        status: 'SELESAI',
                        totalAmount: 100000,
                        items: [],
                    },
                },
            ];
            prisma.feedback.findMany.mockResolvedValue(mockFeedbacks);

            await getMyFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { userId: 'user1' },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockFeedbacks);
        });

        it('should return 500 on database error', async () => {
            prisma.feedback.findMany.mockRejectedValue(new Error('Database error'));

            await getMyFeedbacks(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getAllFeedbacks', () => {
        it('should return all feedbacks without filters', async () => {
            const mockFeedbacks = [
                { id: 'fb1', rating: 5, user: { id: 'user1', name: 'User 1', email: 'user1@test.com' } },
                { id: 'fb2', rating: 4, user: { id: 'user2', name: 'User 2', email: 'user2@test.com' } },
            ];
            prisma.feedback.findMany.mockResolvedValue(mockFeedbacks);

            await getAllFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: {},
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockFeedbacks);
        });

        it('should filter by rating', async () => {
            req.query = { rating: '5' };
            prisma.feedback.findMany.mockResolvedValue([]);

            await getAllFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { rating: 5 },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
        });

        it('should filter by bookingId', async () => {
            req.query = { bookingId: 'booking1' };
            prisma.feedback.findMany.mockResolvedValue([]);

            await getAllFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { bookingId: 'booking1' },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
        });

        it('should filter by userId', async () => {
            req.query = { userId: 'user1' };
            prisma.feedback.findMany.mockResolvedValue([]);

            await getAllFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { userId: 'user1' },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
        });

        it('should filter by multiple params', async () => {
            req.query = { rating: '5', bookingId: 'booking1', userId: 'user1' };
            prisma.feedback.findMany.mockResolvedValue([]);

            await getAllFeedbacks(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { rating: 5, bookingId: 'booking1', userId: 'user1' },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
        });

        it('should return 500 on database error', async () => {
            prisma.feedback.findMany.mockRejectedValue(new Error('Database error'));

            await getAllFeedbacks(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getFeedbackByBooking', () => {
        it('should return feedbacks for a booking', async () => {
            req.params = { bookingId: 'booking1' };
            const mockFeedbacks = [
                { id: 'fb1', rating: 5, user: { id: 'user1', name: 'User 1', email: 'user1@test.com' } },
            ];
            prisma.feedback.findMany.mockResolvedValue(mockFeedbacks);

            await getFeedbackByBooking(req, res);

            expect(prisma.feedback.findMany).toHaveBeenCalledWith({
                where: { bookingId: 'booking1' },
                orderBy: { createdAt: 'desc' },
                include: expect.any(Object),
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockFeedbacks);
        });

        it('should return 500 on database error', async () => {
            req.params = { bookingId: 'booking1' };
            prisma.feedback.findMany.mockRejectedValue(new Error('Database error'));

            await getFeedbackByBooking(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });
});
