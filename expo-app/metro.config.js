// Default Expo Metro config. We do NOT override inlineRequires here so we can
// observe Expo's *default* behavior. (A second variant is provided below via
// the EXPO_INLINE env switch for comparison.)
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Let Metro see the shared source outside the project root.
config.watchFolders = [path.resolve(__dirname, '../shared-app')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// Optional overrides for A/B comparison against Expo's default.
//   EXPO_INLINE=on  -> force Metro inlineRequires while keeping Expo's
//                      experimentalImportSupport (Expo's import handling)
//   EXPO_INLINE=off -> classic RN style (no import support, no inline)
if (process.env.EXPO_INLINE === 'on') {
  config.transformer.getTransformOptions = async () => ({
    transform: { experimentalImportSupport: true, inlineRequires: true },
  });
} else if (process.env.EXPO_INLINE === 'off') {
  config.transformer.getTransformOptions = async () => ({
    transform: { experimentalImportSupport: false, inlineRequires: false },
  });
}

module.exports = config;
