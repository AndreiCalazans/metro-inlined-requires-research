// A "heavy" module. We want to see whether its require() is hoisted to the top
// of the consuming module (eager) or moved to the first use site (inlined/lazy).
export function heavyCompute(n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.sqrt(i) * Math.sin(i);
  }
  return total;
}

export const HEAVY_TAG = 'HEAVY_MODULE_LOADED';
