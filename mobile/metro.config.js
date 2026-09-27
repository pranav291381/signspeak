// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Sign packs (assets/signpacks/*.signpack) are JSON read at runtime, not bundled as code.
config.resolver.assetExts.push('signpack');

module.exports = config;
