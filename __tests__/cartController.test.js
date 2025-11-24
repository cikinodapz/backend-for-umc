jest.mock("@prisma/client", () => {
  const mockPrismaClient = {
    cart: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    service: {
      findUnique: jest.fn(),
    },
    package: {
      findUnique: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

const { PrismaClient } = require("@prisma/client");
const {
  getCartByUser,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require("../controllers/cartController/cart"); 

const prisma = new PrismaClient();

describe("Cart Controller", () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { id: "user-123" },
      body: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  //GET CART BY USER
  describe("getCartByUser", () => {
    it("should return cart items for authenticated user", async () => {
      const mockCartItems = [
        {
          id: "cart-1",
          userId: "user-123",
          serviceId: "service-1",
          packageId: "package-1",
          quantity: 2,
          notes: "Test notes",
          service: {
            id: "service-1",
            name: "Service A",
            category: { id: "cat-1", name: "Category A" },
            Package: [],
          },
          package: { id: "package-1", name: "Package A" },
          createdAt: new Date(),
        },
      ];

      prisma.cart.findMany.mockResolvedValue(mockCartItems);

      await getCartByUser(req, res);

      expect(prisma.cart.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        include: {
          service: {
            include: {
              category: { select: { id: true, name: true } },
              Package: true,
            },
          },
          package: true,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockCartItems);
    });

    it("should return empty array when cart is empty", async () => {
      prisma.cart.findMany.mockResolvedValue([]);

      await getCartByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should handle database error", async () => {
      prisma.cart.findMany.mockRejectedValue(new Error("Database error"));

      await getCartByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  //ADD TO CART
  describe("addToCart", () => {
    it("should add new item to cart successfully", async () => {
      req.body = {
        serviceId: "service-1",
        packageId: "package-1",
        quantity: 1,
        notes: "Test notes",
      };

      const mockService = {
        id: "service-1",
        isActive: true,
        name: "Service A",
      };

      const mockPackage = {
        id: "package-1",
        serviceId: "service-1",
        name: "Package A",
      };

      const mockCartItem = {
        id: "cart-1",
        userId: "user-123",
        serviceId: "service-1",
        packageId: "package-1",
        quantity: 1,
        notes: "Test notes",
        service: mockService,
        package: mockPackage,
      };

      prisma.service.findUnique.mockResolvedValue(mockService);
      prisma.package.findUnique.mockResolvedValue(mockPackage);
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue(mockCartItem);

      await addToCart(req, res);

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { id: "service-1" },
        select: { id: true, isActive: true, name: true },
      });
      expect(prisma.cart.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Berhasil ditambahkan ke keranjang",
        cartItem: mockCartItem,
      });
    });

    it("should update quantity if item already exists in cart", async () => {
      req.body = {
        serviceId: "service-1",
        quantity: 2,
      };

      const mockService = {
        id: "service-1",
        isActive: true,
        name: "Service A",
      };

      const existingCartItem = {
        id: "cart-1",
        quantity: 3,
        notes: "Old notes",
      };

      const updatedCartItem = {
        ...existingCartItem,
        quantity: 5,
      };

      prisma.service.findUnique.mockResolvedValue(mockService);
      prisma.cart.findFirst.mockResolvedValue(existingCartItem);
      prisma.cart.update.mockResolvedValue(updatedCartItem);

      await addToCart(req, res);

      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: "cart-1" },
        data: {
          quantity: 5,
          notes: "Old notes",
          updatedAt: expect.any(Date),
        },
        include: expect.any(Object),
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 if serviceId is missing", async () => {
      req.body = {};

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service ID diperlukan",
      });
    });

    it("should return 404 if service not found", async () => {
      req.body = { serviceId: "non-existent" };

      prisma.service.findUnique.mockResolvedValue(null);

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak ditemukan",
      });
    });

    it("should return 400 if service is not active", async () => {
      req.body = { serviceId: "service-1" };

      prisma.service.findUnique.mockResolvedValue({
        id: "service-1",
        isActive: false,
        name: "Service A",
      });

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Service tidak aktif",
      });
    });

    it("should return 404 if package not found", async () => {
      req.body = {
        serviceId: "service-1",
        packageId: "non-existent",
      };

      prisma.service.findUnique.mockResolvedValue({
        id: "service-1",
        isActive: true,
        name: "Service A",
      });
      prisma.package.findUnique.mockResolvedValue(null);

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Paket tidak ditemukan",
      });
    });

    it("should return 400 if package does not belong to service", async () => {
      req.body = {
        serviceId: "service-1",
        packageId: "package-1",
      };

      prisma.service.findUnique.mockResolvedValue({
        id: "service-1",
        isActive: true,
        name: "Service A",
      });
      prisma.package.findUnique.mockResolvedValue({
        id: "package-1",
        serviceId: "service-2",
        name: "Package A",
      });

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Paket tidak sesuai dengan service",
      });
    });

    it("should handle P2002 error (duplicate entry)", async () => {
      req.body = { 
        serviceId: "service-1",
        packageId: "package-1"
      };

      prisma.service.findUnique.mockResolvedValue({
        id: "service-1",
        isActive: true,
        name: "Service A",
      });

      prisma.package.findUnique.mockResolvedValue({
        id: "package-1",
        serviceId: "service-1",
        name: "Package A",
      });

      prisma.cart.findFirst.mockResolvedValue(null);

      const duplicateError = new Error("Duplicate");
      duplicateError.code = "P2002";
      prisma.cart.create.mockRejectedValue(duplicateError);

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item sudah ada di keranjang",
      });
    });

    it("should handle general database error", async () => {
      req.body = { serviceId: "service-1" };

      prisma.service.findUnique.mockRejectedValue(new Error("DB Error"));

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  //UPDATE CART ITEM
  describe("updateCartItem", () => {
    it("should update cart item successfully", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 5, notes: "Updated notes" };

      const existingCartItem = {
        id: "cart-1",
        userId: "user-123",
        quantity: 3,
      };

      const updatedCartItem = {
        ...existingCartItem,
        quantity: 5,
        notes: "Updated notes",
      };

      prisma.cart.findFirst.mockResolvedValue(existingCartItem);
      prisma.cart.update.mockResolvedValue(updatedCartItem);

      await updateCartItem(req, res);

      expect(prisma.cart.findFirst).toHaveBeenCalledWith({
        where: { id: "cart-1", userId: "user-123" },
      });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: "cart-1" },
        data: {
          quantity: 5,
          notes: "Updated notes",
          updatedAt: expect.any(Date),
        },
        include: expect.any(Object),
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Keranjang berhasil diupdate",
        cartItem: updatedCartItem,
      });
    });

    it("should return 400 if quantity is less than 1", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 0 };

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Quantity harus antara 1-100",
      });
    });

    it("should return 400 if quantity is more than 100", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 101 };

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Quantity harus antara 1-100",
      });
    });

    it("should return 404 if cart item not found", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 5 };

      prisma.cart.findFirst.mockResolvedValue(null);

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item keranjang tidak ditemukan",
      });
    });

    it("should handle P2025 error (record not found)", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 5 };

      prisma.cart.findFirst.mockResolvedValue({ id: "cart-1" });

      const notFoundError = new Error("Not found");
      notFoundError.code = "P2025";
      prisma.cart.update.mockRejectedValue(notFoundError);

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item keranjang tidak ditemukan",
      });
    });

    it("should handle general database error", async () => {
      req.params = { id: "cart-1" };
      req.body = { quantity: 5 };

      prisma.cart.findFirst.mockRejectedValue(new Error("DB Error"));

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  //REMOVE FROM CART
  describe("removeFromCart", () => {
    it("should remove cart item successfully", async () => {
      req.params = { id: "cart-1" };

      const existingCartItem = {
        id: "cart-1",
        userId: "user-123",
      };

      prisma.cart.findFirst.mockResolvedValue(existingCartItem);
      prisma.cart.delete.mockResolvedValue(existingCartItem);

      await removeFromCart(req, res);

      expect(prisma.cart.findFirst).toHaveBeenCalledWith({
        where: { id: "cart-1", userId: "user-123" },
      });
      expect(prisma.cart.delete).toHaveBeenCalledWith({
        where: { id: "cart-1" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item berhasil dihapus dari keranjang",
      });
    });

    it("should return 404 if cart item not found", async () => {
      req.params = { id: "cart-1" };

      prisma.cart.findFirst.mockResolvedValue(null);

      await removeFromCart(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item keranjang tidak ditemukan",
      });
    });

    it("should handle P2025 error (record not found)", async () => {
      req.params = { id: "cart-1" };

      prisma.cart.findFirst.mockResolvedValue({ id: "cart-1" });

      const notFoundError = new Error("Not found");
      notFoundError.code = "P2025";
      prisma.cart.delete.mockRejectedValue(notFoundError);

      await removeFromCart(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item keranjang tidak ditemukan",
      });
    });

    it("should handle general database error", async () => {
      req.params = { id: "cart-1" };

      prisma.cart.findFirst.mockRejectedValue(new Error("DB Error"));

      await removeFromCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });

  //CLEAR CART
  describe("clearCart", () => {
    it("should clear all cart items for user", async () => {
      prisma.cart.deleteMany.mockResolvedValue({ count: 3 });

      await clearCart(req, res);

      expect(prisma.cart.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Keranjang berhasil dikosongkan",
      });
    });

    it("should handle empty cart (no items to delete)", async () => {
      prisma.cart.deleteMany.mockResolvedValue({ count: 0 });

      await clearCart(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Keranjang berhasil dikosongkan",
      });
    });

    it("should handle database error", async () => {
      prisma.cart.deleteMany.mockRejectedValue(new Error("DB Error"));

      await clearCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Terjadi kesalahan server",
      });
    });
  });
});