# 🎨 UMCreative Backend API

Backend REST API untuk **Sistem Informasi Pemesanan Jasa Multimedia UMC Berbasis Web** - Platform manajemen peminjaman aset dan layanan jasa multimedia untuk organisasi UMCreative.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma)](https://prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-452%20passed-brightgreen?logo=jest)](./package.json)

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Tech Stack](#-tech-stack)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [Testing](#-testing)
- [API Endpoints](#-api-endpoints)
- [Struktur Folder](#-struktur-folder)
- [Contributing](#-contributing)

---

## ✨ Fitur

### 🔐 Authentication & Authorization
- Register, Login, Logout
- JWT Token Authentication
- Google OAuth Login
- Password Reset dengan OTP Email
- Role-based Access (User/Admin)

### 🛒 Booking System
- Keranjang (Cart) untuk aset & jasa
- Checkout & Booking Management
- Status tracking (Menunggu → Dikonfirmasi → Selesai)
- Admin confirmation & rejection

### 💳 Payment Integration
- Midtrans Payment Gateway
- QRIS, Bank Transfer, E-Wallet
- Payment status tracking
- Webhook notification handling

### 📦 Asset & Service Management
- CRUD Assets dengan kategori
- CRUD Services dengan packages
- Photo upload support
- Availability tracking

### ⭐ Feedback & Rating
- User feedback untuk booking selesai
- Rating system (1-5)
- Admin feedback overview

### 📊 Dashboard & Analytics
- User dashboard (booking history, stats)
- Admin dashboard (revenue, booking trends)
- Time series statistics

### 🔔 Notifications
- In-app notifications
- Mark as read (single/all)
- Notification types (Booking, Payment, System)

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20.x |
| Framework | Express.js 4.x |
| Database | PostgreSQL 16 |
| ORM | Prisma 6.x |
| Authentication | JWT, bcrypt |
| Payment | Midtrans Client |
| Email | Nodemailer |
| File Upload | Multer |
| Testing | Jest, Supertest |

---

## 📦 Instalasi

### Prerequisites
- Node.js 20.x atau lebih baru
- PostgreSQL 16.x
- npm atau yarn

### Clone Repository
```bash
git clone https://github.com/cikinodapz/backend-for-umc.git
cd backend-for-umc
```

### Install Dependencies
```bash
npm install
```

### Setup Database
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Seed data
npx prisma db seed
```

---

## ⚙️ Konfigurasi

Buat file `.env` di root folder:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/umc_db?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV=development

# Midtrans Payment Gateway
MIDTRANS_SERVER_KEY="your-midtrans-server-key"
MIDTRANS_CLIENT_KEY="your-midtrans-client-key"
MIDTRANS_IS_PRODUCTION=false

# Email (Nodemailer)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3001"
```

---

## 🚀 Menjalankan Aplikasi

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Prisma Studio (Database GUI)
```bash
npx prisma studio
```

Server berjalan di `http://localhost:3000`

---

## 🧪 Testing

Project ini memiliki **452 automated tests** dengan coverage tinggi.

### Run All Tests
```bash
npm run test:all
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration/System Tests Only
```bash
npm run test:integration
```

### Test Coverage

| Type | Tests | Coverage |
|------|-------|----------|
| Unit Tests | 312 | ~97% |
| Integration Tests | 140 | ~40% |
| **Total** | **452** | - |

### Test Suites

| Module | Unit | Integration |
|--------|------|-------------|
| Auth & Profile | ✅ | ✅ |
| Booking | ✅ | ✅ |
| Payment | ✅ | ✅ |
| Feedback | ✅ | ✅ |
| Service & Category | ✅ | ✅ |
| Asset | ✅ | ✅ |
| Notification | ✅ | ✅ |
| Dashboard | ✅ | ✅ |
| Password Reset | ✅ | ✅ |
| Cart | ✅ | - |

---

## 📚 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login user |
| POST | `/auth/logout` | Logout user |
| POST | `/auth/google` | Google OAuth login |
| GET | `/auth/me` | Get current user profile |
| PATCH | `/auth/change-password` | Change password |
| POST | `/auth/password/forgot` | Request password reset OTP |
| POST | `/auth/password/reset` | Reset password with OTP |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/categories` | Get all categories |
| GET | `/categories/:id` | Get category by ID |
| POST | `/categories` | Create category (Admin) |
| PATCH | `/categories/:id` | Update category (Admin) |
| DELETE | `/categories/:id` | Delete category (Admin) |
| GET | `/categories/type/aset` | Get asset categories |
| GET | `/categories/type/jasa` | Get service categories |

### Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets` | Get all assets |
| GET | `/assets/:id` | Get asset by ID |
| POST | `/assets` | Create asset (Admin) |
| PATCH | `/assets/:id` | Update asset (Admin) |
| DELETE | `/assets/:id` | Delete asset (Admin) |

### Services
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/services` | Get all services |
| GET | `/services/:id` | Get service by ID |
| POST | `/services` | Create service (Admin) |
| PATCH | `/services/:id` | Update service (Admin) |
| DELETE | `/services/:id` | Delete service (Admin) |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cart` | Get user's cart |
| POST | `/cart` | Add item to cart |
| PUT | `/cart/:id` | Update cart item |
| DELETE | `/cart/:id` | Remove cart item |

### Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bookings` | Get user's bookings |
| GET | `/bookings/:id` | Get booking detail |
| POST | `/bookings/checkout` | Create booking from cart |
| PUT | `/bookings/:id/cancel` | Cancel booking |
| GET | `/bookings/admin/all` | Get all bookings (Admin) |
| PUT | `/bookings/admin/:id/confirm` | Confirm booking (Admin) |
| PUT | `/bookings/admin/:id/reject` | Reject booking (Admin) |
| PUT | `/bookings/admin/:id/complete` | Complete booking (Admin) |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payments` | Get user's payments |
| GET | `/payments/:id` | Get payment detail |
| POST | `/payments/create/:bookingId` | Create payment |
| GET | `/payments/:id/status` | Check payment status |
| POST | `/payments/notification` | Midtrans webhook |

### Feedbacks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/feedbacks/my` | Get user's feedbacks |
| POST | `/feedbacks` | Create feedback |
| GET | `/feedbacks/by-booking/:id` | Get feedback by booking |
| GET | `/feedbacks/admin/all` | Get all feedbacks (Admin) |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | Get user's notifications |
| PATCH | `/notifications/:id/read` | Mark as read |
| PATCH | `/notifications/read` | Mark all as read |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/user` | User dashboard stats |
| GET | `/dashboard/admin` | Admin dashboard stats |
| GET | `/dashboard/admin/stats` | Admin time series data |

---

## 📁 Struktur Folder

```
backend-for-umc/
├── bin/                    # Application entry point
├── controllers/            # Business logic
│   ├── assetController/
│   ├── authController/
│   ├── bookingController/
│   ├── cartController/
│   ├── categoryController/
│   ├── dashboardController/
│   ├── feedbackController/
│   ├── notificationController/
│   ├── paymentController/
│   └── serviceController/
├── middlewares/            # Express middlewares
│   ├── authMiddleware.js
│   └── upload.js
├── prisma/                 # Database schema & migrations
│   └── schema.prisma
├── routes/                 # API routes
│   ├── assetRoutes/
│   ├── authRoutes/
│   ├── bookingRoutes/
│   ├── cartRoutes/
│   ├── categoryRoutes/
│   ├── dashboardRoutes/
│   ├── feedbackRoutes/
│   ├── notificationRoutes/
│   ├── paymentRoutes/
│   └── serviceRoutes/
├── services/               # External services
├── uploads/                # Uploaded files
├── __tests__/              # Test files
│   ├── *.test.js          # Unit tests
│   └── integration/       # Integration tests
├── __mocks__/              # Jest mocks
├── app.js                  # Express app setup
├── jest.config.js          # Jest configuration
├── jest.integration.config.js
└── package.json
```

---

## 👥 Contributing

1. Fork repository
2. Buat branch baru (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

---

## 📄 License

MIT License - lihat file [LICENSE](LICENSE) untuk detail.

---

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/) - Web framework
- [Prisma](https://prisma.io/) - Database ORM
- [Midtrans](https://midtrans.com/) - Payment gateway
- [Jest](https://jestjs.io/) - Testing framework

---

**Made with ❤️ for UMCreative**
