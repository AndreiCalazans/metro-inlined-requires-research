// This module is imported at the top of index but only referenced inside a
// rarely-called function. With inline requires, its require() should move to
// the call site so it is not evaluated on initial module load.
export function formatRare(value) {
  return `RARE:${String(value).toUpperCase()}`;
}
