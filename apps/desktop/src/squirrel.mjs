import { dirname, basename, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** 安装器事件只管理固定应用快捷方式，不能启动数据库或工作台。 */
export async function handleSquirrel(platform, argv, executable, execute = promisify(execFile)) {
  if (platform !== 'win32') return false;
  const event = argv[1];
  if (!['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete'].includes(event)) return false;
  if (event !== '--squirrel-obsolete') await execute(resolve(dirname(executable), '../Update.exe'),
    [event === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut', basename(executable)], { timeout: 10000, windowsHide: true });
  return true;
}
