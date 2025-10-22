// Jest global setup for tests
// By default, suppress console.error output to avoid Jest treating logs as failures in CI/tests
// Set environment variable SHOW_CONSOLE_ERRORS=1 to see console.error during local debugging

if (!process.env.SHOW_CONSOLE_ERRORS) {
  // silence console.error globally
  const originalConsoleError = console.error;
  // Keep a reference in case some tests want to restore
  global.__originalConsoleError = originalConsoleError;
  console.error = (...args) => {
    console.info(...args); // you can change to console.log if you prefer
  };
}
