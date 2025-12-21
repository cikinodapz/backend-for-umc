const {
    getAllAssets,
    getAssetById,
    createAsset,
    updateAsset,
    deleteAsset,
    getAssetPhoto,
} = require('../controllers/assetController/asset');
const path = require('path');

// Mock PrismaClient
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        asset: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    };
    return {
        PrismaClient: jest.fn(() => mockPrisma),
    };
});

describe('Asset Controller', () => {
    let prisma;
    let req;
    let res;

    beforeEach(() => {
        prisma = new (require('@prisma/client').PrismaClient)();
        req = {
            params: {},
            body: {},
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

    describe('getAllAssets', () => {
        it('should return all assets with photo URLs', async () => {
            const mockAssets = [
                { id: '1', name: 'Asset 1', photoUrl: 'photo1.jpg', category: { id: 'cat1', name: 'Category 1' } },
                { id: '2', name: 'Asset 2', photoUrl: null, category: { id: 'cat2', name: 'Category 2' } },
            ];
            prisma.asset.findMany.mockResolvedValue(mockAssets);

            await getAllAssets(req, res);

            expect(prisma.asset.findMany).toHaveBeenCalledWith({
                include: { category: { select: { id: true, name: true } } },
                orderBy: { name: 'asc' },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([
                { id: '1', name: 'Asset 1', photoUrl: 'http://localhost:3000/uploads/photo1.jpg', category: { id: 'cat1', name: 'Category 1' } },
                { id: '2', name: 'Asset 2', photoUrl: null, category: { id: 'cat2', name: 'Category 2' } },
            ]);
        });

        it('should return 500 on database error', async () => {
            prisma.asset.findMany.mockRejectedValue(new Error('Database error'));

            await getAllAssets(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getAssetById', () => {
        it('should return asset by id', async () => {
            req.params = { id: '1' };
            const mockAsset = { id: '1', name: 'Asset 1', category: { id: 'cat1', name: 'Category 1' } };
            prisma.asset.findUnique.mockResolvedValue(mockAsset);

            await getAssetById(req, res);

            expect(prisma.asset.findUnique).toHaveBeenCalledWith({
                where: { id: '1' },
                include: { category: { select: { id: true, name: true } } },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockAsset);
        });

        it('should return 404 if asset not found', async () => {
            req.params = { id: 'nonexistent' };
            prisma.asset.findUnique.mockResolvedValue(null);

            await getAssetById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Aset tidak ditemukan' });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            prisma.asset.findUnique.mockRejectedValue(new Error('Database error'));

            await getAssetById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('createAsset', () => {
        it('should create asset successfully without photo', async () => {
            req.body = {
                categoryId: 'cat1',
                code: 'AST001',
                name: 'New Asset',
                specification: 'Spec',
                acquisitionDate: '2024-01-01',
                conditionNow: 'BAIK',
                status: 'TERSEDIA',
                dailyRate: 10000,
                stock: 5,
            };
            const mockNewAsset = {
                id: '1',
                ...req.body,
                photoUrl: null,
                category: { id: 'cat1', name: 'Category 1' },
            };
            prisma.asset.findUnique.mockResolvedValue(null); // No existing
            prisma.asset.create.mockResolvedValue(mockNewAsset);

            await createAsset(req, res);

            expect(prisma.asset.findUnique).toHaveBeenCalledWith({ where: { code: 'AST001' } });
            expect(prisma.asset.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Aset berhasil dibuat',
                asset: expect.objectContaining({ photoUrl: null }),
            });
        });

        it('should create asset with photo', async () => {
            req.body = {
                categoryId: 'cat1',
                code: 'AST002',
                name: 'Asset with Photo',
                dailyRate: 15000,
            };
            req.file = { filename: 'photo.jpg' };
            const mockNewAsset = {
                id: '2',
                ...req.body,
                photoUrl: 'photo.jpg',
                category: { id: 'cat1', name: 'Category 1' },
            };
            prisma.asset.findUnique.mockResolvedValue(null);
            prisma.asset.create.mockResolvedValue(mockNewAsset);

            await createAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Aset berhasil dibuat',
                asset: expect.objectContaining({ photoUrl: 'http://localhost:3000/uploads/photo.jpg' }),
            });
        });

        it('should return 400 if code already exists', async () => {
            req.body = { code: 'EXISTING', name: 'Duplicate' };
            prisma.asset.findUnique.mockResolvedValue({ id: '1', code: 'EXISTING' });

            await createAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Kode aset sudah digunakan' });
        });

        it('should create asset with default stock if not provided', async () => {
            req.body = {
                categoryId: 'cat1',
                code: 'AST003',
                name: 'Default Stock Asset',
                dailyRate: 5000,
            };
            prisma.asset.findUnique.mockResolvedValue(null);
            prisma.asset.create.mockResolvedValue({ id: '3', ...req.body, stock: 1 });

            await createAsset(req, res);

            expect(prisma.asset.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ stock: 1 }),
                })
            );
        });

        it('should return 500 on database error', async () => {
            req.body = { code: 'AST004', name: 'Error Asset' };
            prisma.asset.findUnique.mockRejectedValue(new Error('Database error'));

            await createAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('updateAsset', () => {
        it('should update asset successfully without photo', async () => {
            req.params = { id: '1' };
            req.body = {
                categoryId: 'cat1',
                name: 'Updated Asset',
                specification: 'Updated Spec',
                conditionNow: 'BAIK',
                status: 'TERSEDIA',
                dailyRate: 20000,
                stock: 10,
            };
            const mockUpdated = {
                id: '1',
                ...req.body,
                photoUrl: null,
                category: { id: 'cat1', name: 'Category 1' },
            };
            prisma.asset.update.mockResolvedValue(mockUpdated);

            await updateAsset(req, res);

            expect(prisma.asset.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: expect.objectContaining({
                    name: 'Updated Asset',
                    stock: 10,
                }),
                include: { category: { select: { id: true, name: true } } },
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Aset berhasil diupdate',
                asset: expect.objectContaining({ photoUrl: null }),
            });
        });

        it('should update asset with new photo', async () => {
            req.params = { id: '1' };
            req.body = { name: 'Updated Asset' };
            req.file = { filename: 'newphoto.jpg' };
            const mockUpdated = {
                id: '1',
                name: 'Updated Asset',
                photoUrl: 'newphoto.jpg',
                category: { id: 'cat1', name: 'Category 1' },
            };
            prisma.asset.update.mockResolvedValue(mockUpdated);

            await updateAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Aset berhasil diupdate',
                asset: expect.objectContaining({ photoUrl: 'http://localhost:3000/uploads/newphoto.jpg' }),
            });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            req.body = { name: 'Error Update' };
            prisma.asset.update.mockRejectedValue(new Error('Database error'));

            await updateAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('deleteAsset', () => {
        it('should delete asset successfully', async () => {
            req.params = { id: '1' };
            prisma.asset.delete.mockResolvedValue({});

            await deleteAsset(req, res);

            expect(prisma.asset.delete).toHaveBeenCalledWith({ where: { id: '1' } });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Aset berhasil dihapus' });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            prisma.asset.delete.mockRejectedValue(new Error('Database error'));

            await deleteAsset(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });

    describe('getAssetPhoto', () => {
        it('should return asset photo', async () => {
            req.params = { id: '1' };
            prisma.asset.findUnique.mockResolvedValue({ photoUrl: 'photo.jpg' });

            await getAssetPhoto(req, res);

            expect(prisma.asset.findUnique).toHaveBeenCalledWith({
                where: { id: '1' },
                select: { photoUrl: true },
            });
            expect(res.sendFile).toHaveBeenCalled();
        });

        it('should return 404 if asset not found', async () => {
            req.params = { id: 'nonexistent' };
            prisma.asset.findUnique.mockResolvedValue(null);

            await getAssetPhoto(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Foto aset tidak ditemukan' });
        });

        it('should return 404 if asset has no photo', async () => {
            req.params = { id: '1' };
            prisma.asset.findUnique.mockResolvedValue({ photoUrl: null });

            await getAssetPhoto(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Foto aset tidak ditemukan' });
        });

        it('should return 500 on database error', async () => {
            req.params = { id: '1' };
            prisma.asset.findUnique.mockRejectedValue(new Error('Database error'));

            await getAssetPhoto(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
        });
    });
});
