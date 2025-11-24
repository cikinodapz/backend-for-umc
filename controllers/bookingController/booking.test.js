// controllers/bookingController/booking.test.js

// ==== MOCK PRISMA & MAILER ====

// Satu instance prisma palsu yang akan dipakai oleh controller
const mockPrisma = {
  booking: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  bookingItem: {
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
  notification: {
    create: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

// Mock @prisma/client supaya ketika di dalam controller
// ada `new PrismaClient()`, yang dipakai adalah mockPrisma di atas
jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    NotificationType: {
      BOOKING: "BOOKING",
    },
  };
});

// Mock mailer, supaya tidak benar-benar mengirim email
jest.mock("../../services/mailer", () => ({
  sendMail: jest.fn(),
  buildAdminBookingEmail: jest.fn(() => ({
    subject: "subject",
    text: "text",
    html: "<p>html</p>",
  })),
  buildUserBookingStatusEmail: jest.fn(() => ({
    subject: "subject",
    text: "text",
    html: "<p>html</p>",
  })),
  buildAdminBookingCompletedEmail: jest.fn(() => ({
    subject: "subject",
    text: "text",
    html: "<p>html</p>",
  })),
}));

// Setelah mock siap, baru require controller
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
} = require("./booking");

// Helper untuk bikin response palsu ala Express
function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res); // supaya chain: res.status(...).json(...)
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Reset state sebelum tiap test
beforeEach(() => {
  jest.clearAllMocks();
  process.env.BASE_APP_URL = "https://example.com";
  process.env.ADMIN_EMAILS = "";
});

// ================== TEST getBookingsByUser ==================
describe("getBookingsByUser", () => {
  it("mengambil daftar booking berdasarkan userId dari req.user", async () => {
    const fakeBookings = [{ id: "b1" }, { id: "b2" }];

    mockPrisma.booking.findMany.mockResolvedValue(fakeBookings);

    const req = { user: { id: "user-1" } };
    const res = createMockRes();

    await getBookingsByUser(req, res);

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: expect.any(Object),
      orderBy: { createdAt: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeBookings);
  });
});

// ================== TEST createBookingFromCart ==================
describe("createBookingFromCart", () => {
  it("mengembalikan 400 jika startDate atau endDate tidak diisi", async () => {
    const req = {
      user: { id: "user-1" },
      body: {
        startDate: null,
        endDate: null,
        notes: "catatan",
      },
    };
    const res = createMockRes();

    await createBookingFromCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Tanggal mulai dan akhir diperlukan",
    });
  });

  it("mengembalikan 400 jika tanggal mulai setelah tanggal akhir", async () => {
    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-10",
        endDate: "2025-01-01",
        notes: "catatan",
      },
    };
    const res = createMockRes();

    await createBookingFromCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",
    });
  });

  it("mengembalikan 400 jika cart kosong", async () => {
    mockPrisma.cart.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        notes: "catatan",
      },
    };
    const res = createMockRes();

    await createBookingFromCart(req, res);

    expect(mockPrisma.cart.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        service: { select: { id: true, isActive: true, name: true, unitRate: true } },
        package: { select: { id: true, unitRate: true } },
      },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Keranjang kosong, tambahkan item terlebih dahulu",
    });
  });

  it("berhasil membuat booking dari cart", async () => {
    // Cart dengan satu item
    mockPrisma.cart.findMany.mockResolvedValue([
      {
        id: "cart-1",
        userId: "user-1",
        serviceId: "svc-1",
        packageId: null,
        quantity: 2,
        notes: "catatan item",
        service: {
          id: "svc-1",
          isActive: true,
          name: "Service A",
          unitRate: { toNumber: () => 100000 },
        },
        package: null,
      },
    ]);

    const fakeBooking = { id: "booking-1", totalAmount: 200000 };
    mockPrisma.booking.create.mockResolvedValue(fakeBooking);
    mockPrisma.cart.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({ name: "User", email: "u@example.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-01",
        endDate: "2025-01-01",
        notes: "catatan booking",
      },
    };
    const res = createMockRes();

    await createBookingFromCart(req, res);

    expect(mockPrisma.booking.create).toHaveBeenCalled();
    expect(mockPrisma.cart.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil dibuat dari keranjang",
      booking: fakeBooking,
    });
  });
});

// ================== TEST createBooking (manual, tanpa cart) ==================
describe("createBooking", () => {
  it("mengembalikan 400 jika tanggal tidak diisi", async () => {
    const req = {
      user: { id: "user-1" },
      body: {
        startDate: null,
        endDate: null,
        items: [],
      },
    };
    const res = createMockRes();

    await createBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Tanggal mulai dan akhir diperlukan",
    });
  });

  it("mengembalikan 400 jika startDate > endDate", async () => {
    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-10",
        endDate: "2025-01-01",
        items: [],
      },
    };
    const res = createMockRes();

    await createBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",
    });
  });

  it("mengembalikan 400 jika items kosong", async () => {
    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        items: [],
      },
    };
    const res = createMockRes();

    await createBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Minimal satu item jasa diperlukan",
    });
  });

  it("mengembalikan 404 jika service tidak ditemukan", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        items: [
          { serviceId: "svc-1", quantity: 1, notes: "catatan" },
        ],
      },
    };
    const res = createMockRes();

    await createBooking(req, res);

    expect(mockPrisma.service.findUnique).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Service svc-1 tidak ditemukan",
    });
  });

  it("berhasil membuat booking manual dengan satu service", async () => {
    mockPrisma.service.findUnique.mockResolvedValue({
      id: "svc-1",
      isActive: true,
      name: "Service A",
      unitRate: { toNumber: () => 50000 },
    });
    mockPrisma.package.findUnique.mockResolvedValue(null);

    const fakeBooking = { id: "booking-1", totalAmount: 50000 };
    mockPrisma.booking.create.mockResolvedValue(fakeBooking);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.notification.create.mockResolvedValue({});

    const req = {
      user: { id: "user-1" },
      body: {
        startDate: "2025-01-01",
        endDate: "2025-01-01",
        notes: "catatan booking",
        items: [
          { serviceId: "svc-1", quantity: 1, notes: "catatan item" },
        ],
      },
    };
    const res = createMockRes();

    await createBooking(req, res);

    expect(mockPrisma.booking.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil dibuat",
      booking: fakeBooking,
    });
  });
});

// ================== TEST updateBooking ==================
describe("updateBooking", () => {
  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
      body: {},
    };
    const res = createMockRes();

    await updateBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika status booking bukan MENUNGGU", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      status: "SELESAI",
      notes: "lama",
      items: [],
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-02"),
    });

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
      body: { notes: "baru" },
    };
    const res = createMockRes();

    await updateBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Hanya booking menunggu yang bisa diupdate",
    });
  });

  it("mengembalikan 400 jika tanggal baru tidak valid (start > end)", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      notes: "lama",
      items: [],
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-02"),
    });

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
      body: {
        startDate: "2025-02-10",
        endDate: "2025-02-01",
      },
    };
    const res = createMockRes();

    await updateBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",
    });
  });

  it("berhasil mengupdate booking (ubah notes saja)", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      notes: "lama",
      items: [],
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-02"),
    });

    const updatedBooking = {
      id: "booking-1",
      status: "MENUNGGU",
      notes: "catatan baru",
    };

    mockPrisma.booking.update.mockResolvedValue(updatedBooking);

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
      body: { notes: "catatan baru" },
    };
    const res = createMockRes();

    await updateBooking(req, res);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          notes: "catatan baru",
          updatedAt: expect.any(Date),
        }),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil diupdate",
      booking: updatedBooking,
    });
  });
});

// ================== TEST cancelBooking ==================
describe("cancelBooking", () => {
  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await cancelBooking(req, res);

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: "booking-1", userId: "user-1" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika status booking bukan MENUNGGU/DIKONFIRMASI", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      status: "SELESAI",
    });

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Hanya booking menunggu atau dikonfirmasi yang bisa dibatalkan",
    });
  });

  it("berhasil membatalkan booking", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      userId: "user-1",
    });

    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1", status: "DIBATALKAN" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "u@example.com", name: "User" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "user-1" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await cancelBooking(req, res);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: {
        status: "DIBATALKAN",
        updatedAt: expect.any(Date),
      },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil dibatalkan",
    });
  });
});

// ================== TEST getAllBookings (admin) ==================
describe("getAllBookings", () => {
  it("mengembalikan 403 jika user bukan admin", async () => {
    const req = {
      user: { id: "user-1", role: "USER" },
    };
    const res = createMockRes();

    await getAllBookings(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Akses ditolak, hanya admin",
    });
  });

  it("mengembalikan semua booking untuk admin", async () => {
    const fakeBookings = [{ id: "b1" }, { id: "b2" }];
    mockPrisma.booking.findMany.mockResolvedValue(fakeBookings);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
    };
    const res = createMockRes();

    await getAllBookings(req, res);

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeBookings);
  });
});

// ================== TEST getBookingById (admin) ==================
describe("getBookingById", () => {
  it("mengembalikan 403 jika user bukan admin", async () => {
    const req = {
      user: { id: "user-1", role: "USER" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await getBookingById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Akses ditolak, hanya admin",
    });
  });

  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await getBookingById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan booking jika ditemukan", async () => {
    const fakeBooking = { id: "booking-1" };
    mockPrisma.booking.findUnique.mockResolvedValue(fakeBooking);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await getBookingById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeBooking);
  });
});

// ================== TEST confirmBooking (admin) ==================
describe("confirmBooking", () => {
  it("mengembalikan 403 jika user bukan admin", async () => {
    const req = {
      user: { id: "user-1", role: "USER" },
      params: { id: "booking-1" },
      body: { notes: "catatan admin" },
    };
    const res = createMockRes();

    await confirmBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Akses ditolak, hanya admin",
    });
  });

  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { notes: "catatan admin" },
    };
    const res = createMockRes();

    await confirmBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika status booking bukan MENUNGGU", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "SELESAI",
      notes: "lama",
      userId: "user-1",
    });

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { notes: "catatan admin" },
    };
    const res = createMockRes();

    await confirmBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Hanya booking menunggu yang bisa dikonfirmasi",
    });
  });

  it("berhasil mengkonfirmasi booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      notes: "lama",
      userId: "user-1",
    });

    const updatedBooking = {
      id: "booking-1",
      status: "DIKONFIRMASI",
    };

    mockPrisma.booking.update.mockResolvedValue(updatedBooking);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "u@example.com", name: "User" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { notes: "catatan admin" },
    };
    const res = createMockRes();

    await confirmBooking(req, res);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          status: "DIKONFIRMASI",
          approvalId: "admin-1",
          updatedAt: expect.any(Date),
        }),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil dikonfirmasi",
      booking: updatedBooking,
    });
  });
});

// ================== TEST rejectBooking (admin) ==================
describe("rejectBooking", () => {
  it("mengembalikan 403 jika user bukan admin", async () => {
    const req = {
      user: { id: "user-1", role: "USER" },
      params: { id: "booking-1" },
      body: { reason: "alasan" },
    };
    const res = createMockRes();

    await rejectBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Akses ditolak, hanya admin",
    });
  });

  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { reason: "alasan" },
    };
    const res = createMockRes();

    await rejectBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika status booking bukan MENUNGGU", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "SELESAI",
      notes: "lama",
      userId: "user-1",
    });

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { reason: "alasan" },
    };
    const res = createMockRes();

    await rejectBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Hanya booking menunggu yang bisa ditolak",
    });
  });

  it("berhasil menolak booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      notes: "lama",
      userId: "user-1",
    });

    const updatedBooking = {
      id: "booking-1",
      status: "DITOLAK",
    };

    mockPrisma.booking.update.mockResolvedValue(updatedBooking);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "u@example.com", name: "User" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
      body: { reason: "alasan" },
    };
    const res = createMockRes();

    await rejectBooking(req, res);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          status: "DITOLAK",
          approvalId: "admin-1",
          updatedAt: expect.any(Date),
        }),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil ditolak",
      booking: updatedBooking,
    });
  });
});

// ================== TEST completeBooking (admin) ==================
describe("completeBooking", () => {
  it("mengembalikan 403 jika user bukan admin", async () => {
    const req = {
      user: { id: "user-1", role: "USER" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Akses ditolak, hanya admin",
    });
  });

  it("mengembalikan 404 jika booking tidak ditemukan", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking tidak ditemukan",
    });
  });

  it("mengembalikan 400 jika status booking bukan DIKONFIRMASI", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "MENUNGGU",
      userId: "user-1",
    });

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Hanya booking dikonfirmasi yang bisa diselesaikan",
    });
  });

  it("berhasil menyelesaikan booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      status: "DIKONFIRMASI",
      userId: "user-1",
    });

    const updatedBooking = {
      id: "booking-1",
      status: "SELESAI",
    };

    mockPrisma.booking.update.mockResolvedValue(updatedBooking);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "u@example.com", name: "User" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = {
      user: { id: "admin-1", role: "ADMIN" },
      params: { id: "booking-1" },
    };
    const res = createMockRes();

    await completeBooking(req, res);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          status: "SELESAI",
          updatedAt: expect.any(Date),
        }),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Booking berhasil diselesaikan",
      booking: updatedBooking,
    });
  });
});
