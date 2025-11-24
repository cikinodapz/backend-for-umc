const request = require("supertest");
const express = require("express");
const { PrismaClient } = require("@prisma/client");

// Import controller
const serviceController = require("../controllers/serviceController/service");
const prisma = new PrismaClient();

// Setup express untuk test
const app = express();
app.use(express.json());

// Buat rute test sementara
app.get("/services", serviceController.getAllServices);
app.get("/services/:id", serviceController.getServiceById);
app.post("/services", serviceController.createService);
app.delete("/services/:id", serviceController.deleteService);

describe("Service Controller Unit Test", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("GET /services - Berhasil ambil semua data service", async () => {
    prisma.service.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Jasa Fotografi",
        photoUrl: "foto.png",
        category: { id: "1", name: "Multimedia" },
        Package: [],
      },
    ]);

    const res = await request(app).get("/services");

    expect(res.statusCode).toBe(200);
    expect(res.body[0].name).toBe("Jasa Fotografi");
    expect(prisma.service.findMany).toHaveBeenCalledTimes(1);
  });

  test("GET /services/:id - Berhasil ambil 1 data service", async () => {
    prisma.service.findUnique.mockResolvedValue({
      id: "1",
      name: "Jasa Video Editing",
      photoUrl: "edit.png",
      category: { id: "2", name: "Video" },
      Package: [],
    });

    const res = await request(app).get("/services/1");

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe("Jasa Video Editing");
  });

  test("POST /services - Berhasil membuat service baru", async () => {
    prisma.service.create.mockResolvedValue({
      id: "3",
      name: "Jasa Desain Grafis",
      category: { id: "1", name: "Multimedia" },
      photoUrl: null,
      Package: [],
    });

    const res = await request(app)
      .post("/services")
      .send({
        name: "Jasa Desain Grafis",
        categoryId: "1",
        unitRate: "200000",
        isActive: true,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.service.name).toBe("Jasa Desain Grafis");
    expect(prisma.service.create).toHaveBeenCalledTimes(1);
  });

  test("DELETE /services/:id - Berhasil menghapus service", async () => {
    prisma.service.findUnique.mockResolvedValue({ id: "1", photoUrl: null });
    prisma.service.delete.mockResolvedValue({ id: "1" });

    const res = await request(app).delete("/services/1");

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/berhasil dihapus/i);
  });
});
