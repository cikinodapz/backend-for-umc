const {
    createPayment,
    getPaymentDetails,
    handleMidtransNotification,
    checkPaymentStatus,
    listPayments,
    getPaymentDetailsByBookingAdmin,
} = require('../controllers/paymentController/payment');

// Mock mailer
jest.mock('../services/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true),
    buildUserPaymentSuccessEmail: jest.fn().mockReturnValue({ subject: 'test', text: 'test', html: 'test' }),
    buildAdminPaymentReceivedEmail: jest.fn().mockReturnValue({ subject: 'test', text: 'test', html: 'test' }),
}));

// Mock midtrans-client
jest.mock('midtrans-client', () => {
    return {
        Snap: jest.fn().mockImplementation(() => ({
            createTransaction: jest.fn().mockResolvedValue({
                token: 'mock-token',
                redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/mock-token',
            }),
            transaction: {
                status: jest.fn().mockResolvedValue({
                    transaction_status: 'settlement',
                    fraud_status: 'accept',
                }),
            },
        })),
    };
});

// Mock PrismaClient
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        booking: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        payment: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        notification: {
            create: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation((callback) => callback({
            payment: { update: jest.fn() },
            booking: { update: jest.fn() },
        })),
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
        PaymentMethod: { QRIS: 'QRIS', TRANSFER: 'TRANSFER', CASH: 'CASH' },
        PaymentStatus: { PENDING: 'PENDING', PAID: 'PAID', FAILED: 'FAILED' },
        BookingStatus: { DIKONFIRMASI: 'DIKONFIRMASI', DIBAYAR: 'DIBAYAR' },
        NotificationType: { PAYMENT: 'PAYMENT' },
    };
});

describe('Payment Controller', () => {
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

    describe('createPayment', () => {
        it('should return 401 if user not authenticated', async () => {
            req.user = null;
            req.params = { bookingId: 'b1' };

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: 'User tidak terautentikasi' });
        });

        it('should return 400 if booking ID is missing', async () => {
            req.params = {};

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking ID diperlukan' });
        });

        it('should return 404 if booking not found', async () => {
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking tidak ditemukan' });
        });

        it('should return 403 if booking does not belong to user', async () => {
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'otherUser', status: 'DIKONFIRMASI' });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking bukan milik Anda' });
        });

        it('should return 400 if booking not confirmed', async () => {
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'MENUNGGU' });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Booking belum dikonfirmasi oleh admin' });
        });

        it('should return 400 if payment already exists', async () => {
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'user1', status: 'DIKONFIRMASI' });
            prisma.payment.findFirst.mockResolvedValue({ id: 'p1', status: 'PENDING' });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Sudah ada pembayaran yang sedang diproses',
            }));
        });

        it('should return 404 if user not found', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'QRIS' };
            // First call for booking check, second call for calculateBookingTotal
            prisma.booking.findUnique
                .mockResolvedValueOnce({
                    id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                    totalAmount: 100000,
                    items: [],
                })
                .mockResolvedValueOnce({
                    id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                    totalAmount: 100000,
                    items: [],
                });
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue(null);

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'User tidak ditemukan' });
        });

        it('should create payment successfully with QRIS method', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'QRIS' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1',
                userId: 'user1',
                status: 'DIKONFIRMASI',
                totalAmount: 100000,
                items: [{ quantity: 1, unitPrice: 100000 }],
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-01'),
            });
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({
                name: 'Test User',
                email: 'test@test.com',
                phone: '08123456789'
            });
            prisma.payment.create.mockResolvedValue({
                id: 'p1',
                bookingId: 'b1',
                amount: '100000',
                method: 'QRIS',
                status: 'PENDING',
                booking: { id: 'b1', startDate: new Date(), endDate: new Date(), status: 'DIKONFIRMASI' },
            });

            await createPayment(req, res);

            expect(prisma.payment.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Pembayaran berhasil dibuat',
            }));
        });

        it('should create payment with TRANSFER method', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'TRANSFER' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                totalAmount: 50000,
                items: [],
            });
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'user@test.com' });
            prisma.payment.create.mockResolvedValue({
                id: 'p1',
                method: 'TRANSFER',
                booking: {},
            });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should create payment with CASH method', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'CASH' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                totalAmount: 50000,
                items: [],
            });
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'user@test.com' });
            prisma.payment.create.mockResolvedValue({
                id: 'p1',
                method: 'CASH',
                booking: {},
            });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 400 if amount is zero or negative', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'QRIS' };
            prisma.booking.findUnique
                .mockResolvedValueOnce({
                    id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                    totalAmount: 0,
                    items: [],
                })
                .mockResolvedValueOnce({
                    id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                    totalAmount: 0,
                    items: [],
                });
            prisma.payment.findFirst.mockResolvedValue(null);

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Amount pembayaran tidak valid' });
        });

        it('should calculate total manually when totalAmount is not set', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'QRIS' };
            const mockBooking = {
                id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                totalAmount: null,
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-03'),
                items: [
                    { quantity: 2, unitPrice: 10000 },
                    { quantity: 1, unitPrice: 5000 },
                ],
            };
            prisma.booking.findUnique.mockResolvedValue(mockBooking);
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({ name: 'Test User', email: 'test@test.com' });
            prisma.payment.create.mockResolvedValue({
                id: 'p1',
                booking: {},
            });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should handle user with no name', async () => {
            req.params = { bookingId: 'b1' };
            req.body = { method: 'QRIS' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1', userId: 'user1', status: 'DIKONFIRMASI',
                totalAmount: 50000,
                items: [],
            });
            prisma.payment.findFirst.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({ name: null, email: 'user@test.com' });
            prisma.payment.create.mockResolvedValue({
                id: 'p1',
                booking: {},
            });

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 500 on database error', async () => {
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await createPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getPaymentDetails', () => {
        it('should return 401 if user not authenticated', async () => {
            req.user = null;
            req.params = { id: 'p1' };

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 404 if payment not found', async () => {
            req.params = { id: 'p1' };
            prisma.payment.findUnique.mockResolvedValue(null);

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 403 if user not authorized', async () => {
            req.params = { id: 'p1' };
            prisma.payment.findUnique.mockResolvedValue({
                id: 'p1',
                booking: { userId: 'otherUser' },
            });

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return payment details for owner', async () => {
            req.params = { id: 'p1' };
            const mockPayment = {
                id: 'p1',
                amount: 100000,
                booking: { userId: 'user1', items: [] },
            };
            prisma.payment.findUnique.mockResolvedValue(mockPayment);

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockPayment);
        });

        it('should return payment details for admin', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { id: 'p1' };
            const mockPayment = {
                id: 'p1',
                booking: { userId: 'user1' },
            };
            prisma.payment.findUnique.mockResolvedValue(mockPayment);

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.params = { id: 'p1' };
            prisma.payment.findUnique.mockRejectedValue(new Error('Database error'));

            await getPaymentDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('handleMidtransNotification', () => {
        it('should handle test notification', async () => {
            req.body = { order_id: 'payment_notif_test_123456' };
            prisma.payment.findFirst.mockResolvedValue({
                id: 'p1',
                bookingId: 'b1',
                booking: { userId: 'user1', status: 'DIKONFIRMASI' },
            });
            prisma.payment.update.mockResolvedValue({});
            prisma.booking.update.mockResolvedValue({});

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 200 when test notification but no payment found', async () => {
            req.body = { order_id: 'payment_notif_test_123456' };
            prisma.payment.findFirst.mockResolvedValue(null);

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle real notification for existing payment', async () => {
            req.body = { order_id: 'bk-12345678-123456' };
            prisma.payment.findFirst.mockResolvedValue({
                id: 'p1',
                bookingId: 'b1',
                status: 'PENDING',
                referenceNo: 'bk-12345678-123456',
                booking: { id: 'b1', userId: 'user1', status: 'DIKONFIRMASI' },
            });
            prisma.user.findMany.mockResolvedValue([{ id: 'admin1' }]);

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 200 when payment not found', async () => {
            req.body = { order_id: 'bk-unknown-123456' };
            prisma.payment.findFirst
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);
            prisma.payment.findMany.mockResolvedValue([]);

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should skip update if payment already paid', async () => {
            req.body = { order_id: 'bk-12345678-123456' };
            prisma.payment.findFirst.mockResolvedValue({
                id: 'p1',
                bookingId: 'b1',
                status: 'PAID',
                referenceNo: 'bk-12345678-123456',
                booking: { id: 'b1', userId: 'user1', status: 'DIBAYAR' },
            });

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Payment already processed' });
        });

        it('should return 200 on error with message', async () => {
            req.body = { order_id: 'bk-12345678-123456' };
            prisma.payment.findFirst.mockRejectedValue(new Error('Database error'));

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Notification received but processing failed',
            }));
        });

        it('should find alternative payment when exact match not found', async () => {
            req.body = { order_id: 'bk-12345678-123456' };
            prisma.payment.findFirst
                .mockResolvedValueOnce(null) // First lookup fails
                .mockResolvedValueOnce({ id: 'p1', referenceNo: 'bk-12345678-000000' }); // Alternative found
            prisma.payment.findMany.mockResolvedValue([]);

            await handleMidtransNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('checkPaymentStatus', () => {
        it('should return 401 if user not authenticated', async () => {
            req.user = null;
            req.params = { paymentId: 'p1' };

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 404 if payment not found', async () => {
            req.params = { paymentId: 'p1' };
            prisma.payment.findUnique.mockResolvedValue(null);

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 403 if user not authorized', async () => {
            req.params = { paymentId: 'p1' };
            prisma.payment.findUnique.mockResolvedValue({
                id: 'p1',
                referenceNo: 'ref123',
                booking: { userId: 'otherUser' },
            });

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return payment status for authorized user', async () => {
            req.params = { paymentId: 'p1' };
            prisma.payment.findUnique.mockResolvedValue({
                id: 'p1',
                status: 'PENDING',
                referenceNo: 'ref123',
                booking: { userId: 'user1' },
            });

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return payment status for admin', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { paymentId: 'p1' };
            prisma.payment.findUnique.mockResolvedValue({
                id: 'p1',
                status: 'PAID',
                referenceNo: 'ref123',
                booking: { userId: 'user1' },
            });

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on error', async () => {
            req.params = { paymentId: 'p1' };
            prisma.payment.findUnique.mockRejectedValue(new Error('Database error'));

            await checkPaymentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('listPayments', () => {
        it('should return 401 if user not authenticated', async () => {
            req.user = null;

            await listPayments(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return payments for user', async () => {
            const mockPayments = [
                { id: 'p1', booking: { userId: 'user1' } },
            ];
            prisma.payment.findMany.mockResolvedValue(mockPayments);

            await listPayments(req, res);

            expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { booking: { userId: 'user1' } },
            }));
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockPayments);
        });

        it('should return all payments for admin', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            const mockPayments = [
                { id: 'p1', booking: { userId: 'user1' } },
                { id: 'p2', booking: { userId: 'user2' } },
            ];
            prisma.payment.findMany.mockResolvedValue(mockPayments);

            await listPayments(req, res);

            expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: {},
            }));
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            prisma.payment.findMany.mockRejectedValue(new Error('Database error'));

            await listPayments(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getPaymentDetailsByBookingAdmin', () => {
        it('should return 403 if not admin', async () => {
            req.user = { id: 'user1', role: 'PEMINJAM' };
            req.params = { bookingId: 'b1' };

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 400 if booking ID is missing', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = {};

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 404 if booking not found', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue(null);

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return payment details for admin', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-05'),
                totalAmount: 100000,
                status: 'DIKONFIRMASI',
                user: { id: 'user1', name: 'User', email: 'user@test.com' },
                items: [{ subtotal: 100000 }],
            });
            prisma.payment.findMany.mockResolvedValue([
                { id: 'p1', status: 'PAID', amount: 100000 },
            ]);

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                booking: expect.any(Object),
                summary: expect.objectContaining({
                    isPaid: true,
                    paymentCount: 1,
                }),
                payments: expect.any(Array),
            }));
        });

        it('should handle booking without dates', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockResolvedValue({
                id: 'b1',
                startDate: null,
                endDate: null,
                totalAmount: 50000,
                items: [],
            });
            prisma.payment.findMany.mockResolvedValue([]);

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.user = { id: 'admin1', role: 'ADMIN' };
            req.params = { bookingId: 'b1' };
            prisma.booking.findUnique.mockRejectedValue(new Error('Database error'));

            await getPaymentDetailsByBookingAdmin(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
