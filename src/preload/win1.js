const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ドロップ時: mainからファイル情報を取得
  getDraggedFile: () => ipcRenderer.invoke('get-dragged-file'),
  // オーディオドロップをmainへ通知
  notifyAudioDropped: (relativePath) => ipcRenderer.send('audio-dropped', relativePath),
});
