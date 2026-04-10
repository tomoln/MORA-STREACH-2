const dropZone = document.getElementById('drop-zone');
const fileInfo = document.getElementById('file-info');
const badge    = document.getElementById('badge');
const fileName = document.getElementById('file-name');
const filePath = document.getElementById('file-path');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('over');

  const info = await window.api.getDraggedFile();
  if (!info) return;

  badge.textContent = info.type.toUpperCase();
  badge.className   = `badge ${info.type}`;
  fileName.textContent = info.name;
  filePath.textContent = info.relativePath;

  fileInfo.classList.add('visible');

  if (info.type === 'audio') {
    window.api.notifyAudioDropped(info.relativePath);
  }
});
