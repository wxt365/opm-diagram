const path = require('node:path');
module.exports = {
  outDir: path.join(__dirname, 'out', require('./package.json').version),
  packagerConfig: {
    name: 'OPM Studio', executableName: 'opm-studio', appBundleId: 'org.opm.studio', asar: true,
    icon: path.join(__dirname, 'assets/opm-studio'),
    extraResource: [path.join(__dirname, '.runtime/opm')],
    ignore: [/^\/(?:\.runtime|test|scripts|out)(?:\/|$)/, /^\/README\.md$/],
    ...(process.env.OPM_MAC_SIGN_IDENTITY ? { osxSign: { identity: process.env.OPM_MAC_SIGN_IDENTITY } } : {}),
    ...(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID ? {
      osxNotarize: { appleId: process.env.APPLE_ID, appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD, teamId: process.env.APPLE_TEAM_ID },
    } : {}),
  },
  makers: [
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'], config: { format: 'ULFO', icon: path.join(__dirname, 'assets/opm-studio.icns') } },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: {
      name: 'opm_studio', authors: 'OPM Studio contributors', description: 'OPM 本地建模客户端',
      setupIcon: path.join(__dirname, 'assets/opm-studio.ico'),
      ...(process.env.OPM_WINDOWS_CERTIFICATE_FILE ? { certificateFile: process.env.OPM_WINDOWS_CERTIFICATE_FILE, certificatePassword: process.env.OPM_WINDOWS_CERTIFICATE_PASSWORD } : {}),
    } },
  ],
  hooks: {
    prePackage: async (_config, platform, arch) => {
      if (platform !== process.platform || arch !== process.arch) throw new Error('请在目标平台与目标架构的原生构建环境执行打包。');
      const { verifyResources } = await import('./src/resources.mjs');
      const resources = await verifyResources(path.join(__dirname, '.runtime/opm'), platform, arch);
      if (resources.manifest.developmentRuntime) throw new Error('开发态宿主运行时禁止用于发行包，请显式提供可分发 JRE 与 Node。');
    },
  },
};
