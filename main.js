const { app } = require('electron');
const { createWindows } = require('./src/main/windows');
const { registerIpcHandlers, createMenu } = require('./src/main/ipc');

app.whenReady().then(() => {
  registerIpcHandlers();
  createMenu();
  createWindows();

  app.on('activate', () => {
    const { BrowserWindow } = require('electron');
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
