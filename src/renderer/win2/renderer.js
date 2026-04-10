const ICONS = { audio: '🔊', json: '{}' };

async function init() {
  const files = await window.api.listAssets();
  const container = document.getElementById('file-list');

  // audioとjsonをセクション分けして表示
  const sections = [
    { type: 'audio', label: 'Audio' },
    { type: 'json',  label: 'JSON'  },
  ];

  for (const { type, label } of sections) {
    const group = files.filter(f => f.type === type);
    if (group.length === 0) continue;

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'section-label';
    sectionLabel.textContent = label;
    container.appendChild(sectionLabel);

    for (const file of group) {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.dataset.type = file.type;
      item.draggable = true;
      item.innerHTML = `
        <span class="icon">${ICONS[file.type] ?? '📄'}</span>
        <span class="name">${file.name}</span>
      `;

      item.addEventListener('dragstart', (e) => {
        // mainプロセスにファイル情報を預ける
        window.api.dragStarted({
          name: file.name,
          type: file.type,
          relativePath: file.relativePath,
        });
        e.dataTransfer.effectAllowed = 'copy';
        // dataTransfer にもセット（ドラッグ中のカーソル表示用）
        e.dataTransfer.setData('text/plain', file.name);
      });

      container.appendChild(item);
    }
  }
}

init();
