const { contextBridge, ipcRenderer } = require('electron');

// 只暴露固定动作；没有任意文件、进程或网络调用入口。
contextBridge.exposeInMainWorld('opmDesktop', Object.freeze({
  getState: () => ipcRenderer.invoke('desktop:state'),
  openSettings: () => ipcRenderer.invoke('desktop:settings'),
  saveSettings: value => ipcRenderer.invoke('desktop:save-settings', value),
  clearKey: () => ipcRenderer.invoke('desktop:clear-key'),
  testConnection: () => ipcRenderer.invoke('desktop:test-connection'),
  backup: () => ipcRenderer.invoke('desktop:backup'),
  restore: () => ipcRenderer.invoke('desktop:restore'),
  diagnostics: () => ipcRenderer.invoke('desktop:diagnostics'),
  openData: () => ipcRenderer.invoke('desktop:open-data'),
  openLogs: () => ipcRenderer.invoke('desktop:open-logs'),
  onPrepare: callback => {
    const listener = (_event, nonce) => callback(nonce);
    ipcRenderer.on('desktop:prepare', listener);
    return () => ipcRenderer.removeListener('desktop:prepare', listener);
  },
  prepared: (nonce, accepted) => ipcRenderer.send('desktop:prepared', { nonce, accepted: accepted === true }),
}));
