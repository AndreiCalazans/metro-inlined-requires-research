const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Build a config that can resolve the shared app (which lives outside this
// project's root) while still resolving react-native from THIS project's
// node_modules.
function makeConfig({ inlineRequires }) {
  const defaultConfig = getDefaultConfig(__dirname);

  return mergeConfig(defaultConfig, {
    // Allow Metro to crawl the shared source folder outside projectRoot.
    watchFolders: [path.resolve(__dirname, '../shared-app')],
    resolver: {
      // Resolve node_modules (react, react-native, ...) from this project.
      nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    },
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires,
        },
      }),
    },
  });
}

module.exports = makeConfig;
