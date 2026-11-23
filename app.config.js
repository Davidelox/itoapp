// Entorno de APNs según el perfil de EAS: development solo para builds de desarrollo.
const mode = process.env.EAS_BUILD_PROFILE === 'preview' || process.env.EAS_BUILD_PROFILE === 'production' ? 'production' : 'development';

module.exports = ({ config }) => ({
  ...config,
  plugins: config.plugins.map((p) =>
    Array.isArray(p) && p[0] === 'expo-notifications' ? [p[0], { ...p[1], mode }] : p
  ),
});
