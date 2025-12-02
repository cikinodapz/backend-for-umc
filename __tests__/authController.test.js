const { login, register } = require('../controllers/authController/auth');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
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

describe('Auth Controller', () => {
  let prisma;
  let req;
  let res;

  beforeEach(() => {
    prisma = new PrismaClient();
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
});
