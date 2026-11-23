export function assertNodeVersion(version = process.versions.node) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 24 || major === 24 && minor < 9)
    throw new Error(`智能助手需要 Node.js 24.9 或更高版本，当前为 ${version}；使用 nvm use 切换后重启。`);
}
