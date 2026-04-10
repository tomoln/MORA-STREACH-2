const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  sendFadeState:       (enabled) => ipcRenderer.send('fade-changed', enabled),
  sendAddSliceMode:    (enabled) => ipcRenderer.send('add-slice-mode', enabled),
  sendTimestrechState: (ratio)   => ipcRenderer.send('timestretch-changed', ratio),
});
