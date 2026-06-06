// When bundling for production with rnx-kit tree shaking, the esbuild serializer
// needs ESM left intact so it can statically analyze + drop dead code. rnx-cli's
// --tree-shake sets RNX_METRO_SERIALIZER_ESBUILD; we disable Babel's
// import/export -> CommonJS transform in that case.
const esbuildTreeShake = !!process.env.RNX_METRO_SERIALIZER_ESBUILD;

module.exports = {
  presets: [
    [
      '@react-native/babel-preset',
      { disableImportExportTransform: esbuildTreeShake },
    ],
  ],
};
