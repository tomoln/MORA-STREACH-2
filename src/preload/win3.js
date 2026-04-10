const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // main → win3: 波形データ受信
  onShowWaveform: (callback) =>
    ipcRenderer.on('show-waveform', (_event, payload) => callback(payload)),
  // win3 → main: アタック検出結果を送信
  sendAttacks: (attacks) => ipcRenderer.send('attacks-ready', attacks),
  // win3 → main: 新モーラ追加通知
  sendMoraAdded: (payload) => ipcRenderer.send('mora-added', payload),
  // win3 → main: moraのend更新通知
  sendMoraEndUpdated: (payload) => ipcRenderer.send('mora-end-updated', payload),
  // main → win3: .mora ファイルからアタックを復元
  onRestoreAttacks: (callback) =>
    ipcRenderer.on('restore-attacks', (_event, attacks) => callback(attacks)),
  // main → win3: フェード状態変更
  onFadeChanged: (callback) =>
    ipcRenderer.on('fade-changed', (_event, enabled) => callback(enabled)),
  // main → win3: Add Slice モード変更
  onAddSliceMode: (callback) =>
    ipcRenderer.on('add-slice-mode', (_event, enabled) => callback(enabled)),
  // main → win3: 追加モーラの復元
  onRestoreAddedMoras: (callback) =>
    ipcRenderer.on('restore-added-moras', (_event, items) => callback(items)),
  // main → win3: moraEndUpdatesの復元
  onRestoreMoraEndUpdates: (callback) =>
    ipcRenderer.on('restore-mora-end-updates', (_event, updates) => callback(updates)),
  // main → win3: Timestretch 状態変更（ratio: 0.5〜1.0 or null）
  onTimestrechChanged: (callback) =>
    ipcRenderer.on('timestretch-changed', (_event, ratio) => callback(ratio)),
  // main → win3: Export トリガー
  onTriggerExport: (callback) =>
    ipcRenderer.on('trigger-export', (_event) => callback()),
  // win3 → main: Export データ送信
  sendExportData: (payload) => ipcRenderer.send('export-data', payload),
});
