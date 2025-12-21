/**
 * Jest Configuration for Integration Tests
 * 
 * Konfigurasi khusus untuk system/integration testing
 * TIDAK menggunakan mocks dari __mocks__ folder
 */

module.exports = {
    // Hanya jalankan integration tests
    testMatch: ['**/*.integration.test.js'],

    // Jalankan serial (tidak parallel)
    maxWorkers: 1,

    // PENTING: Jangan gunakan automock dan abaikan __mocks__ folder
    automock: false,

    // Reset mocks sebelum setiap test
    resetMocks: true,
    clearMocks: true,

    // Timeout lebih lama untuk integration tests (30 detik)
    testTimeout: 30000,

    // Abaikan mocks folder
    modulePathIgnorePatterns: ['<rootDir>/__mocks__/'],

    // Verbose output
    verbose: true,
};
