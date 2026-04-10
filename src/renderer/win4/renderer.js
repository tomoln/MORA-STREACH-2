const fileNameEl  = document.getElementById('file-name');
const wordCountEl = document.getElementById('word-count');
const placeholder = document.getElementById('placeholder');
const wordList    = document.getElementById('word-list');

function fmt(sec) {
  return sec.toFixed(3) + 's';
}

function buildMoraTable(word) {
  const wrap = document.createElement('div');
  wrap.className = 'mora-table';

  const head = document.createElement('div');
  head.className = 'mora-table-head';
  head.innerHTML = '<span>#</span><span>sid</span><span>text</span><span>start</span><span>end</span><span>dur</span><span>attack</span><span>grid</span>';
  wrap.appendChild(head);

  for (const mora of word.moras) {
    const row = document.createElement('div');
    row.className = 'mora-row';
    row.dataset.key = `${word.word_id}_${mora.mora_id}`;
    row.innerHTML = `
      <span class="mora-id">${mora.mora_id}</span>
      <span class="mora-id">${mora.slice_id}</span>
      <span class="mora-text">${mora.text}</span>
      <span class="mora-ts">${fmt(mora.start)}</span>
      <span class="mora-ts">${fmt(mora.end)}</span>
      <span class="mora-dur">${(mora.duration * 1000).toFixed(0)}ms</span>
      <span class="mora-attack">—</span>
      <span class="mora-grid">1</span>
    `;
    wrap.appendChild(row);
  }

  return wrap;
}

function buildWordGroup(word) {
  const group = document.createElement('div');
  group.className = 'word-group';

  const row = document.createElement('div');
  row.className = 'word-row';
  row.innerHTML = `
    <span class="toggle-icon">▶</span>
    <span class="word-text">${word.word}</span>
    <span class="ts">${fmt(word.start)}</span>
    <span class="ts">${fmt(word.end)}</span>
  `;
  row.addEventListener('click', () => group.classList.toggle('open'));

  group.appendChild(row);
  group.appendChild(buildMoraTable(word));
  return group;
}

window.api.onShowAnnotations(({ name, annotations }) => {
  fileNameEl.textContent = name;
  wordCountEl.textContent = `${annotations.length} words`;

  wordList.innerHTML = '';
  for (const word of annotations) {
    wordList.appendChild(buildWordGroup(word));
  }

  placeholder.style.display = 'none';
  wordList.style.display = 'block';
});

window.api.onRestoreAddedMoras((items) => {
  for (const item of items) {
    const prevRow = wordList.querySelector(`.mora-row[data-key="${item.word_id}_${item.prevMoraId}"]`);
    if (!prevRow) continue;
    if (wordList.querySelector(`.mora-row[data-key="${item.word_id}_${item.mora.mora_id}"]`)) continue;
    const row = document.createElement('div');
    row.className  = 'mora-row';
    row.dataset.key = `${item.word_id}_${item.mora.mora_id}`;
    row.innerHTML = `
      <span class="mora-id">${item.mora.mora_id}</span>
      <span class="mora-id">${item.mora.slice_id}</span>
      <span class="mora-text">${item.mora.text || '—'}</span>
      <span class="mora-ts">${fmt(item.mora.start)}</span>
      <span class="mora-ts">${fmt(item.mora.end)}</span>
      <span class="mora-dur">${(item.mora.duration * 1000).toFixed(0)}ms</span>
      <span class="mora-attack detected">${fmt(item.attackSec)}</span>
      <span class="mora-grid">1</span>
    `;
    prevRow.insertAdjacentElement('afterend', row);
  }
});

window.api.onMoraAdded(({ word_id, prevMoraId, mora, attackSec }) => {
  // prevMora の行を探し、その直後に新モーラ行を挿入
  const prevRow = wordList.querySelector(`.mora-row[data-key="${word_id}_${prevMoraId}"]`);
  if (!prevRow) return;

  const row = document.createElement('div');
  row.className = 'mora-row';
  row.dataset.key = `${word_id}_${mora.mora_id}`;
  row.innerHTML = `
    <span class="mora-id">${mora.mora_id}</span>
    <span class="mora-id">${mora.slice_id}</span>
    <span class="mora-text">${mora.text || '—'}</span>
    <span class="mora-ts">${fmt(mora.start)}</span>
    <span class="mora-ts">${fmt(mora.end)}</span>
    <span class="mora-dur">${(mora.duration * 1000).toFixed(0)}ms</span>
    <span class="mora-attack detected">${fmt(attackSec)}</span>
    <span class="mora-grid">1</span>
  `;
  prevRow.insertAdjacentElement('afterend', row);
});

window.api.onShowAttacks((attacks) => {
  for (const { word_id, mora_id, attackSec, isFallback, grid_count } of attacks) {
    const row = wordList.querySelector(`.mora-row[data-key="${word_id}_${mora_id}"]`);
    if (!row) continue;
    const el = row.querySelector('.mora-attack');
    if (el) {
      el.textContent = fmt(attackSec);
      el.className = `mora-attack ${isFallback ? 'fallback' : 'detected'}`;
    }
    const gc = row.querySelector('.mora-grid');
    if (gc && grid_count !== undefined) gc.textContent = grid_count;
  }
});
