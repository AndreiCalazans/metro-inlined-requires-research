// Loaded via dynamic import() to study how Metro handles "async" requires for
// native targets (does it split into a separate chunk, or keep it inline?).
export function lazyGreeting() {
  return 'LAZY_CHUNK_EVALUATED';
}
