const base = require('./metro.config.base')({ inlineRequires: true });
base.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true, inlineRequires: true },
});
module.exports = base;
