// Reproducible probe: run expo-router's REAL route discovery against an
// instrumented require.context and observe which route modules actually load.
//   node router_probe.js
process.env.NODE_ENV = 'production';
const { getRoutes } = require('expo-router/build/getRoutes');

const loaded = [];
const make = () => ({ default: function Comp() {}, __esModule: true });
const files = {
  './_layout.js': () => make(),
  './index.js': () => make(),
  './one.js': () => make(),
  './two.js': () => make(),
  './heavy.js': () => make(),
};
function ctx(key) { loaded.push(key); return files[key](); } // record real loads
ctx.keys = () => Object.keys(files);                          // keys() must NOT load
ctx.resolve = (k) => k;
ctx.id = 'probe';

const routes = getRoutes(ctx, { preserveApiRoutes: false });

console.log('Modules LOADED during route discovery:', [...new Set(loaded)]);
const leaves = (routes.children || []).filter(n => n.type === 'route').map(n => n.route);
console.log('Leaf routes (each behind a lazy loadRoute thunk):', leaves);
console.log('Leaf modules loaded at discovery time:',
  leaves.filter(r => loaded.includes(`./${r}.js`)).length, '/', leaves.length);
