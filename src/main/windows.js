const { BrowserWindow } = require('electron');
const path = require('path');

let win1 = null;
let win2 = null;
let win3 = null;
let win4 = null;
let win5 = null;

function createWin1() {
  win1 = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Mora Streach',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/win1.js'),
    },
  });
  win1.loadFile(path.join(__dirname, '../renderer/win1/index.html'));
  win1.on('closed', () => { win1 = null; });
}

function createWin2() {
  win2 = new BrowserWindow({
    width: 400,
    height: 600,
    title: 'Assets Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/win2.js'),
    },
  });
  win2.loadFile(path.join(__dirname, '../renderer/win2/index.html'));
  win2.on('closed', () => { win2 = null; });
}

function createWin3() {
  win3 = new BrowserWindow({
    width: 900,
    height: 480,
    title: 'Waveform',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/win3.js'),
    },
  });
  win3.loadFile(path.join(__dirname, '../renderer/win3/index.html'));
  win3.on('closed', () => { win3 = null; });
}

function createWin4() {
  win4 = new BrowserWindow({
    width: 580,
    height: 560,
    title: 'Annotations',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/win4.js'),
    },
  });
  win4.loadFile(path.join(__dirname, '../renderer/win4/index.html'));
  win4.on('closed', () => { win4 = null; });
}

function createWin5() {
  win5 = new BrowserWindow({
    width: 260,
    height: 280,
    title: 'Controls',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/win5.js'),
    },
  });
  win5.loadFile(path.join(__dirname, '../renderer/win5/index.html'));
  win5.on('closed', () => { win5 = null; });
}

function createWindows() {
  createWin1();
  createWin2();
  createWin3();
  createWin4();
  createWin5();
}

function getWin1() { return win1; }
function getWin2() { return win2; }
function getWin3() { return win3; }
function getWin4() { return win4; }
function getWin5() { return win5; }

module.exports = { createWindows, getWin1, getWin2, getWin3, getWin4, getWin5 };
