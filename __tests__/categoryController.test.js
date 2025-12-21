const {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    getAssetCategories,
    getServiceCategories,
} = require('../controllers/categoryController/category');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        category: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
    };
});

describe('Category Controller', () => {
    let prisma;
    let req;
    let res;

    beforeEach(() => {
        prisma = new (require('@prisma/client').PrismaClient)();
        req = {
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

    describe('getAllCategories', () => {
        it('should return all categories successfully', async () => {
            const mockCategories = [
                { id: '1', name: 'Category 1', description: 'Desc 1', type: 'ASET' },
                { id: '2', name: 'Category 2', description: 'Desc 2', type: 'JASA' },
            ];
            prisma.category.findMany.mockResolvedValue(mockCategories);

            await getAllCategories(req, res);

            expect(prisma.category.findMany).toHaveBeenCalledWith({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    type: true,
                },
                orderBy: { name: 'asc' },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockCategories);
        });

        it('should return 500 on database error', async () => {
            prisma.category.findMany.mockRejectedValue(new Error('Database error'));

            await getAllCategories(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getCategoryById', () => {
        it('should return category by id successfully', async () => {
            const mockCategory = { id: '1', name: 'Category 1', description: 'Desc 1', type: 'ASET' };
            req.params = { id: '1' };
            prisma.category.findUnique.mockResolvedValue(mockCategory);

            await getCategoryById(req, res);

            expect(prisma.category.findUnique).toHaveBeenCalledWith({
                where: { id: '1' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    type: true,
                },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockCategory);
        });

        it('should return 404 if category not found', async () => {
            req.params = { id: 'nonexistent' };
            prisma.category.findUnique.mockResolvedValue(null);

            await getCategoryById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Kategori tidak ditemukan' });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            prisma.category.findUnique.mockRejectedValue(new Error('Database error'));

            await getCategoryById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('createCategory', () => {
        it('should create category successfully', async () => {
            req.body = { name: 'New Category', description: 'New Desc', type: 'ASET' };
            const mockNewCategory = { id: '1', name: 'New Category', description: 'New Desc', type: 'ASET' };
            prisma.category.findFirst.mockResolvedValue(null);
            prisma.category.create.mockResolvedValue(mockNewCategory);

            await createCategory(req, res);

            expect(prisma.category.findFirst).toHaveBeenCalledWith({ where: { name: 'New Category' } });
            expect(prisma.category.create).toHaveBeenCalledWith({
                data: { name: 'New Category', description: 'New Desc', type: 'ASET' },
                select: { id: true, name: true, description: true, type: true },
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Kategori berhasil dibuat',
                category: mockNewCategory,
            });
        });

        it('should return 400 if category already exists', async () => {
            req.body = { name: 'Existing Category', description: 'Desc', type: 'ASET' };
            prisma.category.findFirst.mockResolvedValue({ id: '1', name: 'Existing Category' });

            await createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Kategori sudah ada' });
        });

        it('should return 500 on database error', async () => {
            req.body = { name: 'New Category', description: 'Desc', type: 'ASET' };
            prisma.category.findFirst.mockRejectedValue(new Error('Database error'));

            await createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('updateCategory', () => {
        it('should update category successfully', async () => {
            req.params = { id: '1' };
            req.body = { name: 'Updated Category', description: 'Updated Desc', type: 'JASA' };
            const mockUpdatedCategory = { id: '1', name: 'Updated Category', description: 'Updated Desc', type: 'JASA' };
            prisma.category.update.mockResolvedValue(mockUpdatedCategory);

            await updateCategory(req, res);

            expect(prisma.category.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: { name: 'Updated Category', description: 'Updated Desc', type: 'JASA' },
                select: { id: true, name: true, description: true, type: true },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Kategori berhasil diupdate',
                category: mockUpdatedCategory,
            });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            req.body = { name: 'Updated', description: 'Desc', type: 'ASET' };
            prisma.category.update.mockRejectedValue(new Error('Database error'));

            await updateCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('deleteCategory', () => {
        it('should delete category successfully', async () => {
            req.params = { id: '1' };
            prisma.category.delete.mockResolvedValue({});

            await deleteCategory(req, res);

            expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: '1' } });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Kategori berhasil dihapus' });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            prisma.category.delete.mockRejectedValue(new Error('Database error'));

            await deleteCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getAssetCategories', () => {
        it('should return asset categories successfully', async () => {
            const mockAssetCategories = [
                { id: '1', name: 'Asset Cat 1', description: 'Desc 1', type: 'ASET' },
                { id: '2', name: 'Asset Cat 2', description: 'Desc 2', type: 'ASET' },
            ];
            prisma.category.findMany.mockResolvedValue(mockAssetCategories);

            await getAssetCategories(req, res);

            expect(prisma.category.findMany).toHaveBeenCalledWith({
                where: { type: 'ASET' },
                select: { id: true, name: true, description: true, type: true },
                orderBy: { name: 'asc' },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockAssetCategories);
        });

        it('should return 500 on database error', async () => {
            prisma.category.findMany.mockRejectedValue(new Error('Database error'));

            await getAssetCategories(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getServiceCategories', () => {
        it('should return service categories successfully', async () => {
            const mockServiceCategories = [
                { id: '3', name: 'Service Cat 1', description: 'Desc 1', type: 'JASA' },
                { id: '4', name: 'Service Cat 2', description: 'Desc 2', type: 'JASA' },
            ];
            prisma.category.findMany.mockResolvedValue(mockServiceCategories);

            await getServiceCategories(req, res);

            expect(prisma.category.findMany).toHaveBeenCalledWith({
                where: { type: 'JASA' },
                select: { id: true, name: true, description: true, type: true },
                orderBy: { name: 'asc' },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockServiceCategories);
        });

        it('should return 500 on database error', async () => {
            prisma.category.findMany.mockRejectedValue(new Error('Database error'));

            await getServiceCategories(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });
});
