// __mocks__/@prisma/client.js
const mockPrisma = {
  service: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  package: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

module.exports = { PrismaClient: jest.fn(() => mockPrisma) };
