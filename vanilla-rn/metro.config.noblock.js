const base = require('./metro.config.base')({ inlineRequires: true });
base.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
    nonInlinedRequires: [], // <- empty the default block list
  },
});
module.exports = base;
