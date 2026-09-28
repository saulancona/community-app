// Jest setup file
// Add any global test setup here

// Mock console.warn to reduce noise in tests
global.console.warn = jest.fn();

// Mock Date.now for rate limiting tests
const mockDateNow = jest.spyOn(Date, 'now');

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockDateNow.mockRestore();
});
