const path = require('path');
const { makeMetroConfig } = require('@rnx-kit/metro-config');

// rnx-kit's makeMetroConfig = Metro defaults + robust symlink handling +
// duplicate-dependency detection. We add shared-source resolution.
//
// Tree shaking is enabled per-invocation via `rnx-cli bundle --tree-shake`,
// which swaps in the esbuild serializer (@rnx-kit/metro-serializer-esbuild).
module.exports = makeMetroConfig({
  watchFolders: [path.resolve(__dirname, '../shared-app')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
});
