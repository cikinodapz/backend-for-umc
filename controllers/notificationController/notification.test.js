// controllers/notificationController/notification.test.js

// ===== MOCK PRISMA =====
const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// Mock @prisma/client → setiap new PrismaClient() pakai mockPrisma ini
jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Setelah mock siap, import controllernya
const {
  getUserNotifications,
  markAsRead,
} = require("./notification");

// Helper response palsu ala Express
function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ================== TEST getUserNotifications ==================
describe("getUserNotifications", () => {
  it("mengambil semua notifikasi user tanpa filter read", async () => {
    const fakeNotifications = [
      { id: "n1", userId: "user-1" },
      { id: "n2", userId: "user-1" },
    ];

    mockPrisma.notification.findMany.mockResolvedValue(fakeNotifications);

    const req = {
      user: { id: "user-1" },
      query: {}, // read tidak diisi
    };
    const res = createMockRes();

    await getUserNotifications(req, res);

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { sentAt: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      notifications: fakeNotifications,
      total: fakeNotifications.length,
    });
  });

  it("mengambil notifikasi yang sudah dibaca ketika read='true'", async () => {
    const fakeNotifications = [{ id: "n1", readAt: new Date() }];

    mockPrisma.notification.findMany.mockResolvedValue(fakeNotifications);

    const req = {
      user: { id: "user-1" },
      query: { read: "true" },
    };
    const res = createMockRes();

    await getUserNotifications(req, res);

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        readAt: { not: null },
      },
      orderBy: { sentAt: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      notifications: fakeNotifications,
      total: fakeNotifications.length,
    });
  });

  it("mengambil notifikasi yang belum dibaca ketika read='false'", async () => {
    const fakeNotifications = [{ id: "n1", readAt: null }];

    mockPrisma.notification.findMany.mockResolvedValue(fakeNotifications);

    const req = {
      user: { id: "user-1" },
      query: { read: "false" },
    };
    const res = createMockRes();

    await getUserNotifications(req, res);

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        readAt: null,
      },
      orderBy: { sentAt: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      notifications: fakeNotifications,
      total: fakeNotifications.length,
    });
  });
});

// ================== TEST markAsRead ==================
describe("markAsRead", () => {
  // ---- mark satu notifikasi (dengan id) ----
  it("mengembalikan 404 jika notifikasi tidak ditemukan atau bukan milik user", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "user-1" },
      params: { id: "notif-1" },
    };
    const res = createMockRes();

    await markAsRead(req, res);

    expect(mockPrisma.notification.findUnique).toHaveBeenCalledWith({
      where: { id: "notif-1" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Notifikasi tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika notifikasi sudah dibaca", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: "notif-1",
      userId: "user-1",
      readAt: new Date(),
    });

    const req = {
      user: { id: "user-1" },
      params: { id: "notif-1" },
    };
    const res = createMockRes();

    await markAsRead(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Notifikasi sudah dibaca",
    });
  });

  it("berhasil menandai satu notifikasi sebagai dibaca", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: "notif-1",
      userId: "user-1",
      readAt: null,
    });

    mockPrisma.notification.update.mockResolvedValue({
      id: "notif-1",
      readAt: new Date(),
    });

    const req = {
      user: { id: "user-1" },
      params: { id: "notif-1" },
    };
    const res = createMockRes();

    await markAsRead(req, res);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { readAt: expect.any(Date) },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Notifikasi berhasil ditandai sebagai dibaca",
    });
  });

  // ---- mark semua notifikasi unread (tanpa id) ----
  it("berhasil menandai semua notifikasi unread sebagai dibaca ketika id tidak diberikan", async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const req = {
      user: { id: "user-1" },
      params: {}, // tidak ada id → mark all
    };
    const res = createMockRes();

    await markAsRead(req, res);

    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Semua notifikasi berhasil ditandai sebagai dibaca",
    });
  });
});
