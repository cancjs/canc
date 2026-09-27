// Pinia's dev-time diagnostics reporting is not part of the store behavior under test.
// nostics ships ESM-only, so it is stubbed out here instead of transformed.
// Each diagnostic code becomes a handle matching the real shape for pinia internals.
function createConsoleReporter() {
  return () => {};
}

function defineDiagnostics(options) {
  const result = {};
  for (const code of Object.keys(options.codes || {})) {
    result[code] = (params) => {
      const diagnostic = new Error(code);
      diagnostic.code = code;
      diagnostic.params = params;
      return diagnostic;
    };
  }
  return result;
}

module.exports = { createConsoleReporter, defineDiagnostics };
