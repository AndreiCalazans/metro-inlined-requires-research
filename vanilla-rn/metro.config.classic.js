const base = require('./metro.config.base')({ inlineRequires: true });
base.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: false, inlineRequires: true },
});
module.exports = base;
