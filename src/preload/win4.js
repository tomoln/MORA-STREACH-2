const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onShowAnnotations: (callback) =>
    ipcRenderer.on('show-annotations', (_event, payload) => callback(payload)),
  onShowAttacks: (callback) =>
    ipcRenderer.on('show-attacks', (_event, attacks) => callback(attacks)),
  onMoraAdded: (callback) =>
    ipcRenderer.on('mora-added', (_event, payload) => callback(payload)),
  onMoraEndUpdated: (callback) =>
    ipcRenderer.on('mora-end-updated', (_event, payload) => callback(payload)),
  onRestoreAddedMoras: (callback) =>
    ipcRenderer.on('restore-added-moras', (_event, items) => callback(items)),
});
