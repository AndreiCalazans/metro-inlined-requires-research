export const ONE_HEAVY_MARKER = 'ONE_HEAVY_MODULE_LOADED';
export function oneHeavyCompute(n) {
  let t = 0;
  for (let i = 0; i < n; i++) t += Math.sqrt(i);
  return t.toFixed(2);
}
