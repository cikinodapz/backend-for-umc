/**
 * Jest Configuration for Unit Tests (Default)
 * 
 * Konfigurasi default untuk unit testing
 * Mengabaikan folder integration
 */

module.exports = {
    // Abaikan integration tests secara default
    testPathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/integration/',
    ],

    // Coverage hanya untuk controllers
    collectCoverageFrom: [
        'controllers/**/*.js',
    ],

    // Verbose output
    verbose: false,

    // Test environment
    testEnvironment: 'node',
};
