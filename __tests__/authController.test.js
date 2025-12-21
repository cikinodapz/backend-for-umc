const {
  login,
  logout,
  register,
  getAllUsers,
  googleLogin,
  getProfile,
  changePassword,
  updateProfilePhoto,
  getProfilePhoto
} = require('../controllers/authController/auth');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
}));

// Mock google-auth-library
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    mockVerifyIdToken,
  };
});

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('Auth Controller', () => {
  let prisma;
  let req;
  let res;

  beforeEach(() => {
    prisma = new PrismaClient();
    req = {
      body: {},
      user: null,
      file: null,
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3000'),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      sendFile: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return 404 if user not found', async () => {
      req.body = { email: 'nonexistent@example.com', password: 'password' };
      prisma.user.findUnique.mockResolvedValue(null);

      await login(req, res);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com' },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          role: true,
          status: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak ditemukan' });
    });

    it('should return 400 if password is wrong', async () => {
      req.body = { email: 'zorojuro@gmail.com', password: 'wrongpassword' };
      const mockUser = {
        id: '1',
        email: 'zorojuro@gmail.com',
        passwordHash: 'hashed123',
        role: 'PEMINJAM',
        status: 'AKTIF',
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashed123');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password salah' });
    });

    it('should return 200 with token on successful login for peminjam', async () => {
      req.body = { email: 'zorojuro@gmail.com', password: '123' };
      const mockUser = {
        id: '1',
        email: 'zorojuro@gmail.com',
        passwordHash: 'hashed123',
        role: 'PEMINJAM',
        status: 'AKTIF',
      };
      const mockToken = 'mocktoken';
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue(mockToken);

      await login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('123', 'hashed123');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: '1', email: 'zorojuro@gmail.com', role: 'PEMINJAM' },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '1h' }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login berhasil',
        token: mockToken,
        user: {
          id: '1',
          email: 'zorojuro@gmail.com',
          role: 'PEMINJAM',
          status: 'AKTIF',
        },
      });
    });

    it('should return 200 with token on successful login for admin', async () => {
      req.body = { email: 'admin@umc.ac.id', password: 'admin123' };
      const mockUser = {
        id: '2',
        email: 'admin@umc.ac.id',
        passwordHash: 'hashedadmin123',
        role: 'ADMIN',
        status: 'AKTIF',
      };
      const mockToken = 'admintoken';
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue(mockToken);

      await login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('admin123', 'hashedadmin123');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: '2', email: 'admin@umc.ac.id', role: 'ADMIN' },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '1h' }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login berhasil',
        token: mockToken,
        user: {
          id: '2',
          email: 'admin@umc.ac.id',
          role: 'ADMIN',
          status: 'AKTIF',
        },
      });
    });

    it('should return 500 if login fails unexpectedly', async () => {
      req.body = { email: 'error@example.com', password: '123' };
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('logout', () => {
    it('should return 200 on successful logout', async () => {
      await logout(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Logout berhasil' });
    });

    it('should return 500 if logout fails unexpectedly', async () => {
      // Mock first call to throw, subsequent calls work normally for error handling
      let callCount = 0;
      res.status.mockImplementation((code) => {
        callCount++;
        if (callCount === 1 && code === 200) {
          throw new Error('Unexpected error');
        }
        return res;
      });

      await logout(req, res);

      // Verify error handling path was taken
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('register', () => {
    it('should return 400 if email already exists', async () => {
      req.body = { name: 'Test User', email: 'test@example.com', phone: '123456789', password: 'password' };
      prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await register(req, res);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email sudah digunakan' });
    });

    it('should return 201 on successful registration', async () => {
      req.body = { name: 'Test User', email: 'test@example.com', phone: '123456789', password: 'password' };
      const mockHashedPassword = 'hashedpassword';
      const mockNewUser = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '123456789',
        role: 'PEMINJAM',
      };
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(mockHashedPassword);
      prisma.user.create.mockResolvedValue(mockNewUser);

      await register(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '123456789',
          passwordHash: mockHashedPassword,
          role: 'PEMINJAM',
        },
        select: { id: true, name: true, email: true, phone: true, role: true },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Registrasi berhasil',
        user: mockNewUser,
      });
    });

    it('should return 500 if register fails unexpectedly', async () => {
      req.body = { name: 'Err User', email: 'err@example.com', phone: '1', password: 'password' };
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockRejectedValue(new Error('hash error'));

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('getAllUsers', () => {
    it('should return 200 with list of users', async () => {
      const mockUsers = [
        { id: '1', name: 'User 1', email: 'user1@test.com', phone: '123', role: 'PEMINJAM', status: 'AKTIF', createdAt: new Date() },
        { id: '2', name: 'User 2', email: 'user2@test.com', phone: '456', role: 'ADMIN', status: 'AKTIF', createdAt: new Date() },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      await getAllUsers(req, res);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Daftar user berhasil diambil',
        data: mockUsers,
      });
    });

    it('should return 500 if getAllUsers fails unexpectedly', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('DB error'));

      await getAllUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('googleLogin', () => {
    let mockVerifyIdToken;

    beforeEach(() => {
      const { mockVerifyIdToken: mock } = require('google-auth-library');
      mockVerifyIdToken = mock;
    });

    it('should return 400 if idToken is missing', async () => {
      req.body = {};

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'idToken Google wajib disertakan' });
    });

    it('should return 500 if GOOGLE_CLIENT_ID is not configured', async () => {
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      req.body = { idToken: 'test-token' };

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'GOOGLE_CLIENT_ID belum dikonfigurasi' });

      process.env.GOOGLE_CLIENT_ID = originalClientId;
    });

    it('should return 400 if email is not found in token', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { idToken: 'test-token' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: null }),
      });

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email tidak ditemukan pada token Google' });
    });

    it('should return 400 if email is not verified', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { idToken: 'test-token' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'test@gmail.com', email_verified: false }),
      });

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email Google belum terverifikasi' });
    });

    it('should return 200 for existing user with google login', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { credential: 'test-token' }; // test credential field too
      const mockUser = { id: '1', name: 'Test User', email: 'test@gmail.com', role: 'PEMINJAM', status: 'AKTIF' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'test@gmail.com', name: 'Test User', email_verified: true }),
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login Google berhasil',
        token: 'mock-jwt-token',
        user: mockUser,
      });
    });

    it('should create new user if not exists with google login', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { idToken: 'test-token' };
      const newUser = { id: '1', name: 'New User', email: 'newuser@gmail.com', role: 'PEMINJAM', status: 'AKTIF' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'newuser@gmail.com', name: 'New User', email_verified: true }),
      });
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed-random-password');
      prisma.user.create.mockResolvedValue(newUser);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await googleLogin(req, res);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login Google berhasil',
        token: 'mock-jwt-token',
        user: newUser,
      });
    });

    it('should use email prefix as name if name not provided', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { idToken: 'test-token' };
      const newUser = { id: '1', name: 'unnamed', email: 'unnamed@gmail.com', role: 'PEMINJAM', status: 'AKTIF' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'unnamed@gmail.com', name: null, email_verified: true }),
      });
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed-random-password');
      prisma.user.create.mockResolvedValue(newUser);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await googleLogin(req, res);

      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          name: 'unnamed',
        }),
      }));
    });

    it('should return 500 if google login fails unexpectedly', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      req.body = { idToken: 'test-token' };
      mockVerifyIdToken.mockRejectedValue(new Error('Google API error'));

      await googleLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('getProfile', () => {
    it('should return 401 if user not authenticated', async () => {
      req.user = null;

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak terautentikasi' });
    });

    it('should return 404 if user not found', async () => {
      req.user = { id: '999' };
      prisma.user.findUnique.mockResolvedValue(null);

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak ditemukan' });
    });

    it('should return 200 with user profile with photo', async () => {
      req.user = { id: '1' };
      const mockUser = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '123456789',
        photoUrl: 'profile.jpg',
        role: 'PEMINJAM',
        status: 'AKTIF',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          ...mockUser,
          photoUrl: 'http://localhost:3000/uploads/profile.jpg',
        },
      });
    });

    it('should return 200 with user profile without photo', async () => {
      req.user = { id: '1' };
      const mockUser = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '123456789',
        photoUrl: null,
        role: 'PEMINJAM',
        status: 'AKTIF',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          ...mockUser,
          photoUrl: null,
        },
      });
    });

    it('should return 500 if getProfile fails unexpectedly', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('changePassword', () => {
    it('should return 401 if user not authenticated', async () => {
      req.user = null;

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak terautentikasi' });
    });

    it('should return 400 if passwords not provided', async () => {
      req.user = { id: '1' };
      req.body = {};

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Masukkan password lama dan password baru' });
    });

    it('should return 400 if new password is too short', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'oldpass', newPassword: '12345' };

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Panjang password minimal 6 karakter' });
    });

    it('should return 400 if user has no password hash', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'oldpass', newPassword: 'newpass123' };
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null });

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Akun tidak memiliki password yang dapat diganti' });
    });

    it('should return 400 if current password is wrong', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'wrongpass', newPassword: 'newpass123' };
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashedpass' });
      bcrypt.compare.mockResolvedValue(false);

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password saat ini salah' });
    });

    it('should return 400 if new password is same as old', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'samepass', newPassword: 'samepass' };
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashedsamepass' });
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password baru tidak boleh sama dengan password lama' });
    });

    it('should return 200 on successful password change with currentPassword', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'oldpass', newPassword: 'newpass123' };
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashedoldpass' });
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      bcrypt.hash.mockResolvedValue('hashednewpass');
      prisma.user.update.mockResolvedValue({});

      await changePassword(req, res);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password berhasil diganti' });
    });

    it('should return 200 on successful password change with oldPassword field', async () => {
      req.user = { id: '1' };
      req.body = { oldPassword: 'oldpass', newPassword: 'newpass123' };
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashedoldpass' });
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      bcrypt.hash.mockResolvedValue('hashednewpass');
      prisma.user.update.mockResolvedValue({});

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password berhasil diganti' });
    });

    it('should return 500 if changePassword fails unexpectedly', async () => {
      req.user = { id: '1' };
      req.body = { currentPassword: 'oldpass', newPassword: 'newpass123' };
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('updateProfilePhoto', () => {
    it('should return 401 if user not authenticated', async () => {
      req.user = null;

      await updateProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak terautentikasi' });
    });

    it('should return 400 if no file is uploaded', async () => {
      req.user = { id: '1' };
      req.file = null;

      await updateProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'File foto tidak ditemukan' });
    });

    it('should return 200 on successful photo update without old photo', async () => {
      req.user = { id: '1' };
      req.file = { filename: 'newphoto.jpg' };
      const updatedUser = { id: '1', name: 'Test', email: 'test@test.com', phone: '123', photoUrl: 'newphoto.jpg' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: null });
      prisma.user.update.mockResolvedValue(updatedUser);

      await updateProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Foto profil diperbarui',
        user: {
          ...updatedUser,
          photoUrl: 'http://localhost:3000/uploads/newphoto.jpg',
        },
      });
    });

    it('should delete old photo file when updating', async () => {
      req.user = { id: '1' };
      req.file = { filename: 'newphoto.jpg' };
      const updatedUser = { id: '1', name: 'Test', email: 'test@test.com', phone: '123', photoUrl: 'newphoto.jpg' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: 'oldphoto.jpg' });
      prisma.user.update.mockResolvedValue(updatedUser);
      fs.existsSync.mockReturnValue(true);

      await updateProfilePhoto(req, res);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle error when deleting old photo gracefully', async () => {
      req.user = { id: '1' };
      req.file = { filename: 'newphoto.jpg' };
      const updatedUser = { id: '1', name: 'Test', email: 'test@test.com', phone: '123', photoUrl: 'newphoto.jpg' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: 'oldphoto.jpg' });
      prisma.user.update.mockResolvedValue(updatedUser);
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('Delete failed'); });

      await updateProfilePhoto(req, res);

      // Should still succeed even if delete fails
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should not delete old photo if same as new', async () => {
      req.user = { id: '1' };
      req.file = { filename: 'same.jpg' };
      const updatedUser = { id: '1', name: 'Test', email: 'test@test.com', phone: '123', photoUrl: 'same.jpg' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: 'same.jpg' });
      prisma.user.update.mockResolvedValue(updatedUser);

      await updateProfilePhoto(req, res);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 if updateProfilePhoto fails unexpectedly', async () => {
      req.user = { id: '1' };
      req.file = { filename: 'photo.jpg' };
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await updateProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });

  describe('getProfilePhoto', () => {
    it('should return 401 if user not authenticated', async () => {
      req.user = null;

      await getProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'User tidak terautentikasi' });
    });

    it('should return 404 if user has no photo', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: null });

      await getProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Foto profil tidak ditemukan' });
    });

    it('should return 404 if photo file does not exist', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: 'missing.jpg' });
      fs.existsSync.mockReturnValue(false);

      await getProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'File foto tidak ditemukan' });
    });

    it('should return photo file on success', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockResolvedValue({ photoUrl: 'photo.jpg' });
      fs.existsSync.mockReturnValue(true);

      await getProfilePhoto(req, res);

      expect(res.sendFile).toHaveBeenCalled();
    });

    it('should return 500 if getProfilePhoto fails unexpectedly', async () => {
      req.user = { id: '1' };
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      await getProfilePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
    });
  });
});
