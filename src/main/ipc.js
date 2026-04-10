const { ipcMain, Menu, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { getWin3, getWin4, getWin5 } = require('./windows');

// D&D中のファイル情報を一時保持
let pendingDragFile = null;

// 現在ロード中のファイル名（拡張子なし）と アタックキャッシュ
let currentLoadedName = null;
let autoImportDone    = false;     // 自動 import は最初の1回だけ
const attacksCache    = new Map(); // `${word_id}_${mora_id}` → attack オブジェクト
let addedMorasCache   = [];        // Add Slice で追加したモーラ構造

const ASSETS_ROOT = path.join(__dirname, '../../assets');

function saveMora() {
  if (!currentLoadedName || attacksCache.size === 0) return;
  const attacks  = Array.from(attacksCache.values());
  const data     = { source: currentLoadedName, attacks, addedMoras: addedMorasCache };
  const moraDir  = path.join(ASSETS_ROOT, 'mora');
  if (!fs.existsSync(moraDir)) fs.mkdirSync(moraDir);
  const moraPath = path.join(moraDir, currentLoadedName + '.mora');
  fs.writeFileSync(moraPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('[save] wrote', moraPath);
}

function buildRestoreAddedMoras(addedMoras, attacks) {
  return (addedMoras || []).map(item => {
    const savedAtk = attacks.find(
      a => a.word_id === item.word_id && a.mora_id === item.mora.mora_id
    );
    return { ...item, attackSec: savedAtk ? savedAtk.attackSec : item.mora.start };
  });
}

function importMora() {
  if (!currentLoadedName) return;
  const moraPath = path.join(ASSETS_ROOT, 'mora', currentLoadedName + '.mora');
  if (!fs.existsSync(moraPath)) {
    console.log('[import] .mora not found:', moraPath);
    return;
  }
  try {
    const data    = JSON.parse(fs.readFileSync(moraPath, 'utf8'));
    const attacks = data.attacks || [];

    // キャッシュも更新
    attacksCache.clear();
    addedMorasCache = [];
    for (const a of attacks) attacksCache.set(`${a.word_id}_${a.mora_id}`, a);
    addedMorasCache = data.addedMoras || [];

    const win3 = getWin3();
    const win4 = getWin4();
    const restoreItems = buildRestoreAddedMoras(data.addedMoras, attacks);
    if (restoreItems.length > 0) {
      if (win3) win3.webContents.send('restore-added-moras', restoreItems);
      if (win4) win4.webContents.send('restore-added-moras', restoreItems);
    }
    if (win3) win3.webContents.send('restore-attacks', attacks);
    if (win4) win4.webContents.send('show-attacks', attacks);
    console.log('[import] restored', moraPath);
  } catch (e) {
    console.error('[import] failed', e);
  }
}

function buildWavBuffer(channels, sampleRate) {
  const numCh      = channels.length;
  const numSamples = channels[0].length;
  const BPS        = 2; // 16-bit PCM
  const dataSize   = numCh * numSamples * BPS;
  const buf        = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                          // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * BPS, 28);
  buf.writeUInt16LE(numCh * BPS, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s   = Math.max(-1, Math.min(1, channels[ch][i]));
      const val = Math.round(s < 0 ? s * 32768 : s * 32767);
      buf.writeInt16LE(val, offset);
      offset += BPS;
    }
  }
  return buf;
}

function triggerExport() {
  const win3 = getWin3();
  if (win3) win3.webContents.send('trigger-export');
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save (.mora)',   accelerator: 'CmdOrCtrl+S', click: saveMora },
        { label: 'Import (.mora)', accelerator: 'CmdOrCtrl+I', click: importMora },
        { label: 'Export',         accelerator: 'CmdOrCtrl+E', click: triggerExport },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function listAssets() {
  const audioDir = path.join(ASSETS_ROOT, 'audio');
  const jsonDir = path.join(ASSETS_ROOT, 'json');

  const readDir = (dir, type) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir)
          .filter(f => !f.startsWith('.'))
          .map(f => ({ name: f, type, relativePath: path.join('assets', type, f) }))
      : [];

  return [
    ...readDir(audioDir, 'audio'),
    ...readDir(jsonDir, 'json'),
  ];
}

function registerIpcHandlers() {
  // win2 → main: アセット一覧を返す
  ipcMain.handle('list-assets', () => listAssets());

  // win2 → main: ドラッグ開始時にファイル情報を預かる
  ipcMain.on('drag-started', (_event, fileInfo) => {
    pendingDragFile = fileInfo;
  });

  // win1 → main: ドロップされたのでファイル情報を返す
  ipcMain.handle('get-dragged-file', () => {
    const file = pendingDragFile;
    pendingDragFile = null;
    return file;
  });

  // win1 → main: オーディオがドロップされた → ファイル読み込み + 同名JSON → win3へ送信
  ipcMain.on('audio-dropped', (_event, relativePath) => {
    const win3 = getWin3();
    if (!win3) return;

    const absPath  = path.join(ASSETS_ROOT, '..', relativePath);
    const buffer   = fs.readFileSync(absPath);
    const name     = path.basename(relativePath);
    const baseName = path.basename(relativePath, path.extname(relativePath));

    // ファイルが切り替わったらキャッシュをリセット
    currentLoadedName = baseName;
    autoImportDone    = false;
    attacksCache.clear();
    addedMorasCache   = [];

    let annotations = null;
    const jsonPath = path.join(ASSETS_ROOT, 'json', baseName + '.json');
    if (fs.existsSync(jsonPath)) {
      try { annotations = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}
    }

    win3.webContents.send('show-waveform', { name, buffer, annotations });

    const win4 = getWin4();
    if (win4 && annotations) {
      win4.webContents.send('show-annotations', { name, annotations });
    }
  });

  // win5 → main → win3: フェード状態の中継
  ipcMain.on('fade-changed', (_event, enabled) => {
    const win3 = getWin3();
    if (win3) win3.webContents.send('fade-changed', enabled);
  });

  // win5 → main → win3: Add Slice モードの中継
  ipcMain.on('add-slice-mode', (_event, enabled) => {
    const win3 = getWin3();
    if (win3) win3.webContents.send('add-slice-mode', enabled);
  });

  // win5 → main → win3: Timestretch 状態の中継
  ipcMain.on('timestretch-changed', (_event, ratio) => {
    const win3 = getWin3();
    if (win3) win3.webContents.send('timestretch-changed', ratio);
  });

  // win3 → main: Export データ受信 → assets/out/ に書き出し
  ipcMain.on('export-data', (_event, { name, sampleRate, channels, annotations }) => {
    const outDir = path.join(ASSETS_ROOT, 'out');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const jsonPath = path.join(outDir, name + '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(annotations, null, 2), 'utf8');
    console.log('[export] wrote', jsonPath);

    if (channels) {
      const wavPath = path.join(outDir, name + '.wav');
      fs.writeFileSync(wavPath, buildWavBuffer(channels, sampleRate));
      console.log('[export] wrote', wavPath);
    }
  });

  // win3 → main → win4: 新モーラ追加通知の中継・保存
  ipcMain.on('mora-added', (_event, payload) => {
    const { word_id, prevMoraId, mora } = payload;
    addedMorasCache.push({ word_id, prevMoraId, mora });
    const win4 = getWin4();
    if (win4) win4.webContents.send('mora-added', payload);
  });

  // win3 → main → win4: アタック検出結果の転送（キャッシュも更新）
  ipcMain.on('attacks-ready', (_event, attacks) => {
    for (const a of attacks) {
      attacksCache.set(`${a.word_id}_${a.mora_id}`, a);
    }

    // .mora が存在すれば自動で上書き適用（最初の1回のみ）
    const moraPath = currentLoadedName
      ? path.join(ASSETS_ROOT, 'mora', currentLoadedName + '.mora')
      : null;
    if (!autoImportDone && moraPath && fs.existsSync(moraPath)) {
      autoImportDone = true;
      try {
        const fileData   = JSON.parse(fs.readFileSync(moraPath, 'utf8'));
        const saved      = fileData.attacks || [];
        attacksCache.clear();
        addedMorasCache = fileData.addedMoras || [];
        for (const a of saved) attacksCache.set(`${a.word_id}_${a.mora_id}`, a);
        const win3 = getWin3();
        const win4 = getWin4();
        const restoreItems = buildRestoreAddedMoras(fileData.addedMoras, saved);
        if (restoreItems.length > 0) {
          if (win3) win3.webContents.send('restore-added-moras', restoreItems);
          if (win4) win4.webContents.send('restore-added-moras', restoreItems);
        }
        if (win3) win3.webContents.send('restore-attacks', saved);
        if (win4) win4.webContents.send('show-attacks', saved);
        return;
      } catch {}
    }

    const win4 = getWin4();
    if (win4) win4.webContents.send('show-attacks', attacks);
  });
}

module.exports = { registerIpcHandlers, createMenu };
