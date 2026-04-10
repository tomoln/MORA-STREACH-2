const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // アセット一覧をmainから取得
  listAssets: () => ipcRenderer.invoke('list-assets'),
  // ドラッグ開始時にファイル情報をmainへ預ける
  dragStarted: (fileInfo) => ipcRenderer.send('drag-started', fileInfo),
});
