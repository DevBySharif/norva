// Vitest alias target: stubs Next.js's `server-only` package so unit/integration
// tests can import modules that carry the guard. The app itself never resolves
// this module — Next.js supplies the real `server-only`.
export {};