// __tests__/serviceController.test.js

// Mock Prisma Client sebelum import controller
jest.mock("@prisma/client", () => {
  const mockPrismaClient = {
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
    $transaction: jest.fn((callback) => callback(mockPrismaClient)),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock fs untuk file operations
jest.mock("fs", () => ({
  promises: {
    unlink: jest.fn(),
    access: jest.fn(),
  },
}));

const { PrismaClient } = require("@prisma/client");
const fs = require("fs").promises;
const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServicePhoto,
} = require("../controllers/serviceController/service");

// Inisialisasi mock prisma instance
const prisma = new PrismaClient();

describe("Service Controller", () => {
  let req, res;

  // Matikan console logs selama testing
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    console.error.mockRestore();
    console.warn.mockRestore();
    console.log.mockRestore();
  });

  // Setup mock req dan res sebelum setiap test
  beforeEach(() => {
    // Mock request object
    req = {
      protocol: "http",
      get: jest.fn().mockReturnValue("localhost:3000"),
      body: {},
      params: {},
      file: null,
    };

    // Mock response object
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendFile: jest.fn().mockReturnThis(),
    };

    // Clear semua mock sebelum setiap test
    jest.clearAllMocks();
  });

  // ==================== GET ALL SERVICES ====================
  describe("getAllServices", () => {
    it("should return all services with full URL", async () => {
      const mockServices = [
        {
          id: "service-1",
          name: "Jasa Fotografi",
          description: "Service fotografi profesional",
          unitRate: "500000",
          isActive: true,
          photoUrl: "foto.png",
          category: { id: "cat-1", name: "Multimedia" },
          Package: [
            {
              id: "pkg-1",
              name: "Paket Basic",
              description: "Paket dasar",
              unitRate: "300000",
              features: ["Feature 1", "Feature 2"],
            },
          ],
          createdAt: new Date(),
        },
      ];

      prisma.service.findMany.mockResolvedValue(mockServices);

      await getAllServices(req, res);

      expect(prisma.service.findMany).toHaveBeenCalledWith({
        include: {
          category: { select: { id: true, name: true } },
          Package: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "service-1",
            name: "Jasa Fotografi",
            photoUrl: "http://localhost:3000/uploads/foto.png",
          }),
        ])
      );
    });

    it("should return services with null photoUrl if no photo", async () => {
      const mockServices = [
        {
          id: "service-1",
          name: "Jasa Editing",
          photoUrl: null,
          category: { id: "cat-1", name: "Video" },
          Package: [],
        },
      ];

      prisma.service.findMany.mockResolvedValue(mockServices);

      await getAllServices(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            photoUrl: null,
          }),
        ])
      );
    });

    it("should return empty array when no services exist", async () => {
      prisma.service.findMany.mockResolvedValue([]);

      await getAllServices(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should handle database error", async () => {
      prisma.service.findMany.mockRejectedValue(new Error("Database error"));

      await getAllServices(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  // ==================== GET SERVICE BY ID ====================
  describe("getServiceById", () => {
    it("should return single service with packages", async () => {
      req.params = { id: "service-1" };

      const mockService = {
        id: "service-1",
        name: "Jasa Video Editing",
        description: "Service editing video",
        unitRate: "750000",
        isActive: true,
        photoUrl: "edit.png",
        category: { id: "cat-2", name: "Video" },
        Package: [
          {
            id: "pkg-1",
            name: "Paket Premium",
            description: "Paket lengkap",
            unitRate: "1000000",
            features: ["4K Quality", "Color Grading"],
          },
        ],
      };

      prisma.service.findUnique.mockResolvedValue(mockService);

      await getServiceById(req, res);

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { id: "service-1" },
        include: {
          category: { select: { id: true, name: true } },
          Package: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "service-1",
          name: "Jasa Video Editing",
          photoUrl: "http://localhost:3000/uploads/edit.png",
        })
      );
    });

    it("should return 404 if service not found", async () => {
      req.params = { id: "non-existent" };

      prisma.service.findUnique.mockResolvedValue(null);

      await getServiceById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak ditemukan",
      });
    });

    it("should handle database error", async () => {
      req.params = { id: "service-1" };

      prisma.service.findUnique.mockRejectedValue(new Error("Database error"));

      await getServiceById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  // ==================== CREATE SERVICE ====================
  describe("createService", () => {
    it("should create service without packages", async () => {
      req.body = {
        name: "Jasa Desain Grafis",
        description: "Service desain profesional",
        categoryId: "cat-1",
        unitRate: "200000",
        isActive: "true",
      };

      const mockCreatedService = {
        id: "service-new",
        name: "Jasa Desain Grafis",
        description: "Service desain profesional",
        unitRate: "200000",
        isActive: true,
        photoUrl: null,
        category: { id: "cat-1", name: "Multimedia" },
        Package: [],
      };

      prisma.service.create.mockResolvedValue(mockCreatedService);

      await createService(req, res);

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: {
          name: "Jasa Desain Grafis",
          description: "Service desain profesional",
          unitRate: "200000",
          isActive: true,
          photoUrl: null,
          category: { connect: { id: "cat-1" } },
        },
        include: {
          category: { select: { id: true, name: true } },
          Package: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil dibuat",
        service: expect.objectContaining({
          id: "service-new",
          name: "Jasa Desain Grafis",
        }),
      });
    });

    it("should create service with packages and features", async () => {
      req.body = {
        name: "Jasa Fotografi",
        description: "Service fotografi",
        categoryId: "cat-1",
        unitRate: "500000",
        isActive: true,
        packages: JSON.stringify([
          {
            name: "Paket Basic",
            description: "Paket dasar",
            unitRate: "300000",
            features: ["10 Foto", "1 Jam Sesi"],
          },
          {
            name: "Paket Premium",
            description: "Paket lengkap",
            unitRate: "800000",
            features: ["30 Foto", "3 Jam Sesi", "Album"],
          },
        ]),
      };

      const mockCreatedService = {
        id: "service-new",
        name: "Jasa Fotografi",
        description: "Service fotografi",
        unitRate: "500000",
        isActive: true,
        photoUrl: null,
        category: { id: "cat-1", name: "Multimedia" },
        Package: [
          {
            id: "pkg-1",
            name: "Paket Basic",
            description: "Paket dasar",
            unitRate: "300000",
            features: ["10 Foto", "1 Jam Sesi"],
          },
          {
            id: "pkg-2",
            name: "Paket Premium",
            description: "Paket lengkap",
            unitRate: "800000",
            features: ["30 Foto", "3 Jam Sesi", "Album"],
          },
        ],
      };

      prisma.service.create.mockResolvedValue(mockCreatedService);

      await createService(req, res);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Jasa Fotografi",
            Package: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  name: "Paket Basic",
                  features: ["10 Foto", "1 Jam Sesi"],
                }),
                expect.objectContaining({
                  name: "Paket Premium",
                  features: ["30 Foto", "3 Jam Sesi", "Album"],
                }),
              ]),
            },
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil dibuat dengan 2 paket",
        service: expect.objectContaining({
          Package: expect.arrayContaining([
            expect.objectContaining({ name: "Paket Basic" }),
            expect.objectContaining({ name: "Paket Premium" }),
          ]),
        }),
      });
    });

    it("should create service with uploaded photo", async () => {
      req.body = {
        name: "Jasa Web Design",
        categoryId: "cat-1",
        unitRate: "1000000",
        isActive: true,
      };
      req.file = { filename: "web-design.jpg" };

      const mockCreatedService = {
        id: "service-new",
        name: "Jasa Web Design",
        photoUrl: "web-design.jpg",
        category: { id: "cat-1", name: "Web" },
        Package: [],
      };

      prisma.service.create.mockResolvedValue(mockCreatedService);

      await createService(req, res);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoUrl: "web-design.jpg",
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should handle empty unitRate as default '0'", async () => {
      req.body = {
        name: "Free Service",
        categoryId: "cat-1",
        isActive: true,
      };

      const mockCreatedService = {
        id: "service-new",
        name: "Free Service",
        unitRate: "0",
        category: { id: "cat-1", name: "Free" },
        Package: [],
      };

      prisma.service.create.mockResolvedValue(mockCreatedService);

      await createService(req, res);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitRate: "0",
          }),
        })
      );
    });

    it("should handle database error", async () => {
      req.body = {
        name: "Jasa Test",
        categoryId: "cat-1",
      };

      prisma.service.create.mockRejectedValue(new Error("Database error"));

      await createService(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  // ==================== UPDATE SERVICE ====================
  describe("updateService", () => {
    it("should update service without changing packages", async () => {
      req.params = { id: "service-1" };
      req.body = {
        name: "Jasa Fotografi Updated",
        description: "Updated description",
        unitRate: "600000",
        isActive: "true",
      };

      const mockUpdatedService = {
        id: "service-1",
        name: "Jasa Fotografi Updated",
        description: "Updated description",
        unitRate: "600000",
        isActive: true,
        photoUrl: null,
        category: { id: "cat-1", name: "Multimedia" },
        Package: [],
      };

      // Mock $transaction untuk return mockUpdatedService
      prisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          package: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
          service: {
            update: jest.fn().mockResolvedValue(mockUpdatedService),
          },
        };
        await callback(mockTx);
      });

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil diupdate",
        service: expect.objectContaining({
          name: "Jasa Fotografi Updated",
        }),
      });
    });

    it("should update service and replace all packages", async () => {
      req.params = { id: "service-1" };
      req.body = {
        name: "Jasa Fotografi",
        packages: JSON.stringify([
          {
            name: "Paket New 1",
            description: "New package 1",
            unitRate: "400000",
            features: ["New Feature 1"],
          },
          {
            name: "Paket New 2",
            description: "New package 2",
            unitRate: "700000",
            features: ["New Feature 2", "New Feature 3"],
          },
        ]),
      };

      const mockUpdatedService = {
        id: "service-1",
        name: "Jasa Fotografi",
        category: { id: "cat-1", name: "Multimedia" },
        Package: [
          {
            id: "pkg-new-1",
            name: "Paket New 1",
            features: ["New Feature 1"],
          },
          {
            id: "pkg-new-2",
            name: "Paket New 2",
            features: ["New Feature 2", "New Feature 3"],
          },
        ],
      };

      // Mock $transaction dengan proper implementation
      prisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          package: {
            deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
          service: {
            update: jest.fn().mockResolvedValue(mockUpdatedService),
          },
        };
        await callback(mockTx);
      });

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil diupdate dengan 2 paket",
        service: expect.objectContaining({
          Package: expect.arrayContaining([
            expect.objectContaining({ name: "Paket New 1" }),
            expect.objectContaining({ name: "Paket New 2" }),
          ]),
        }),
      });
    });

    it("should update service and delete all packages if empty array provided", async () => {
      req.params = { id: "service-1" };
      req.body = {
        name: "Jasa Test",
        packages: JSON.stringify([]),
      };

      const mockUpdatedService = {
        id: "service-1",
        name: "Jasa Test",
        category: { id: "cat-1", name: "Test" },
        Package: [],
      };

      // Mock $transaction dengan proper implementation
      prisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          package: {
            deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
            createMany: jest.fn(),
          },
          service: {
            update: jest.fn().mockResolvedValue(mockUpdatedService),
          },
        };
        await callback(mockTx);
      });

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil diupdate dengan 0 paket",
        service: expect.objectContaining({
          Package: [],
        }),
      });
    });

    it("should handle categoryId set to null", async () => {
      req.params = { id: "service-1" };
      req.body = {
        categoryId: "",
        name: "Service Without Category",
      };

      const mockUpdatedService = {
        id: "service-1",
        name: "Service Without Category",
        categoryId: null,
        category: null,
        Package: [],
      };

      // Mock $transaction untuk update dengan categoryId null
      prisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          package: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
          service: {
            update: jest.fn().mockResolvedValue(mockUpdatedService),
          },
        };
        await callback(mockTx);
      });

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          service: expect.objectContaining({
            categoryId: null,
          }),
        })
      );
    });

    it("should return 404 if service not found (P2025)", async () => {
      req.params = { id: "non-existent" };
      req.body = { name: "Test" };

      const notFoundError = new Error("Not found");
      notFoundError.code = "P2025";

      // Mock $transaction untuk throw error P2025
      prisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          package: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
          service: {
            update: jest.fn().mockRejectedValue(notFoundError),
          },
        };
        await callback(mockTx);
      });

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak ditemukan",
      });
    });

    it("should handle database error", async () => {
      req.params = { id: "service-1" };
      req.body = { name: "Test" };

      // Mock $transaction untuk throw database error
      prisma.$transaction.mockRejectedValue(new Error("Database error"));

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  // ==================== DELETE SERVICE ====================
  describe("deleteService", () => {
    it("should delete service successfully without photo", async () => {
      req.params = { id: "service-1" };

      const mockExistingService = {
        id: "service-1",
        photoUrl: null,
      };

      prisma.service.findUnique.mockResolvedValue(mockExistingService);
      prisma.service.delete.mockResolvedValue(mockExistingService);

      await deleteService(req, res);

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { id: "service-1" },
        select: { id: true, photoUrl: true },
      });
      expect(prisma.service.delete).toHaveBeenCalledWith({
        where: { id: "service-1" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil dihapus",
        deletedService: { id: "service-1" },
      });
    });

    it("should delete service and its photo file", async () => {
      req.params = { id: "service-1" };

      const mockExistingService = {
        id: "service-1",
        photoUrl: "photo.jpg",
      };

      prisma.service.findUnique.mockResolvedValue(mockExistingService);
      prisma.service.delete.mockResolvedValue(mockExistingService);
      fs.unlink.mockResolvedValue();

      await deleteService(req, res);

      expect(fs.unlink).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should delete service even if photo file deletion fails", async () => {
      req.params = { id: "service-1" };

      const mockExistingService = {
        id: "service-1",
        photoUrl: "photo.jpg",
      };

      prisma.service.findUnique.mockResolvedValue(mockExistingService);
      prisma.service.delete.mockResolvedValue(mockExistingService);
      fs.unlink.mockRejectedValue(new Error("File not found"));

      await deleteService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service berhasil dihapus",
        deletedService: { id: "service-1" },
      });
    });

    it("should return 404 if service not found", async () => {
      req.params = { id: "non-existent" };

      prisma.service.findUnique.mockResolvedValue(null);

      await deleteService(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak ditemukan",
      });
      expect(prisma.service.delete).not.toHaveBeenCalled();
    });

    it("should return 404 if service not found during deletion (P2025)", async () => {
      req.params = { id: "service-1" };

      prisma.service.findUnique.mockResolvedValue({ id: "service-1" });

      const notFoundError = new Error("Not found");
      notFoundError.code = "P2025";
      prisma.service.delete.mockRejectedValue(notFoundError);

      await deleteService(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak ditemukan",
      });
    });

    it("should return 400 if service is used in bookings (P2003)", async () => {
      req.params = { id: "service-1" };

      prisma.service.findUnique.mockResolvedValue({ id: "service-1" });

      const constraintError = new Error("Foreign key constraint");
      constraintError.code = "P2003";
      prisma.service.delete.mockRejectedValue(constraintError);

      await deleteService(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tidak dapat menghapus service karena masih digunakan dalam booking",
      });
    });

    it("should handle database error", async () => {
      req.params = { id: "service-1" };

      prisma.service.findUnique.mockRejectedValue(new Error("Database error"));

      await deleteService(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  // ==================== GET SERVICE PHOTO ====================
  describe("getServicePhoto", () => {
    it("should return service photo file", async () => {
      req.params = { id: "service-1" };

      const mockService = {
        id: "service-1",
        photoUrl: "photo.jpg",
      };

      prisma.service.findUnique.mockResolvedValue(mockService);
      fs.access.mockResolvedValue();

      await getServicePhoto(req, res);

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { id: "service-1" },
        select: { photoUrl: true },
      });
      expect(fs.access).toHaveBeenCalled();
      expect(res.sendFile).toHaveBeenCalled();
    });

    it("should return 404 if service has no photo", async () => {
      req.params = { id: "service-1" };

      const mockService = {
        id: "service-1",
        photoUrl: null,
      };

      prisma.service.findUnique.mockResolvedValue(mockService);

      await getServicePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Foto service tidak ditemukan",
      });
    });

    it("should return 404 if service not found", async () => {
      req.params = { id: "non-existent" };

      prisma.service.findUnique.mockResolvedValue(null);

      await getServicePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Foto service tidak ditemukan",
      });
    });

    it("should return 404 if photo file does not exist", async () => {
      req.params = { id: "service-1" };

      const mockService = {
        id: "service-1",
        photoUrl: "photo.jpg",
      };

      prisma.service.findUnique.mockResolvedValue(mockService);
      fs.access.mockRejectedValue(new Error("File not found"));

      await getServicePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Foto service tidak ditemukan",
      });
    });

    it("should handle database error", async () => {
      req.params = { id: "service-1" };

      prisma.service.findUnique.mockRejectedValue(new Error("Database error"));

      await getServicePhoto(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });
});