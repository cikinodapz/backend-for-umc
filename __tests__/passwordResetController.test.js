const { forgotPassword, resetPassword } = require('../controllers/authController/passwordReset');

// Mock dependencies
jest.mock('../services/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true),
}));

jest.mock('@prisma/client', () => {
    const mockPrisma = {
        user: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        passwordReset: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        $transaction: jest.fn(),
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
    };
});

describe('Password Reset Controller', () => {
    let prisma;
    let req;
    let res;
    let mailer;

    beforeEach(() => {
        prisma = new (require('@prisma/client').PrismaClient)();
        mailer = require('../services/mailer');
        req = {
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

    describe('forgotPassword', () => {
        it('should return 400 if email is missing', async () => {
            req.body = {};

            await forgotPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Email wajib diisi' });
        });

        it('should return 200 even if user not found (security)', async () => {
            req.body = { email: 'nonexistent@test.com' };
            prisma.user.findUnique.mockResolvedValue(null);

            await forgotPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Jika email terdaftar, OTP telah dikirim' });
        });

        it('should send OTP email when user exists', async () => {
            req.body = { email: 'user@test.com' };
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1',
                name: 'Test User',
                email: 'user@test.com',
                status: 'AKTIF',
            });
            prisma.passwordReset.updateMany.mockResolvedValue({ count: 0 });
            prisma.passwordReset.create.mockResolvedValue({ id: 'pr1' });

            await forgotPassword(req, res);

            expect(prisma.passwordReset.create).toHaveBeenCalled();
            expect(mailer.sendMail).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle user without name', async () => {
            req.body = { email: 'user@test.com' };
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1',
                name: null,
                email: 'user@test.com',
                status: 'AKTIF',
            });
            prisma.passwordReset.updateMany.mockResolvedValue({ count: 0 });
            prisma.passwordReset.create.mockResolvedValue({ id: 'pr1' });

            await forgotPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 500 on database error', async () => {
            req.body = { email: 'user@test.com' };
            prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

            await forgotPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('resetPassword', () => {
        it('should return 400 if email is missing', async () => {
            req.body = { otp: '123456', newPassword: 'newpass123' };

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Email, OTP, dan password baru wajib diisi' });
        });

        it('should return 400 if otp is missing', async () => {
            req.body = { email: 'user@test.com', newPassword: 'newpass123' };

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if newPassword is missing', async () => {
            req.body = { email: 'user@test.com', otp: '123456' };

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if password is too short', async () => {
            req.body = { email: 'user@test.com', otp: '123456', newPassword: '12345' };

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Panjang password minimal 6 karakter' });
        });

        it('should return 400 if no reset record found', async () => {
            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockResolvedValue(null);

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'OTP tidak valid atau telah kedaluwarsa' });
        });

        it('should return 400 if OTP is expired', async () => {
            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockResolvedValue({
                id: 'pr1',
                otpHash: 'hash',
                expiresAt: new Date(Date.now() - 60000), // Expired
                userId: 'user1',
                attempts: 0,
            });

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'OTP telah kedaluwarsa' });
        });

        it('should return 400 if max attempts exceeded', async () => {
            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockResolvedValue({
                id: 'pr1',
                otpHash: 'hash',
                expiresAt: new Date(Date.now() + 60000), // Not expired
                userId: 'user1',
                attempts: 5, // Max attempts reached
            });
            prisma.passwordReset.update.mockResolvedValue({});

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terlalu banyak percobaan, minta OTP baru' });
        });

        it('should return 400 if OTP is incorrect', async () => {
            const bcrypt = require('bcrypt');
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockResolvedValue({
                id: 'pr1',
                otpHash: '$2b$10$somehashedvalue',
                expiresAt: new Date(Date.now() + 60000),
                userId: 'user1',
                attempts: 0,
            });
            prisma.passwordReset.update.mockResolvedValue({});

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'OTP salah' });
        });

        it('should reset password successfully with valid OTP', async () => {
            const bcrypt = require('bcrypt');
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
            jest.spyOn(bcrypt, 'hash').mockResolvedValue('newhash');

            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockResolvedValue({
                id: 'pr1',
                otpHash: '$2b$10$somehashedvalue',
                expiresAt: new Date(Date.now() + 60000),
                userId: 'user1',
                attempts: 0,
            });
            prisma.$transaction.mockResolvedValue([]);

            await resetPassword(req, res);

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Password berhasil diperbarui' });
        });

        it('should return 500 on database error', async () => {
            req.body = { email: 'user@test.com', otp: '123456', newPassword: 'newpass123' };
            prisma.passwordReset.findFirst.mockRejectedValue(new Error('Database error'));

            await resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });
});
