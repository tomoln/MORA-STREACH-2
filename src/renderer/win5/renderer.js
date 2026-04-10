const btn = document.getElementById('fade-btn');
let fadeOn = false;

btn.addEventListener('click', () => {
  fadeOn = !fadeOn;
  btn.textContent = `Fade  ${fadeOn ? 'ON' : 'OFF'}`;
  btn.classList.toggle('on', fadeOn);
  window.api.sendFadeState(fadeOn);
});

const addSliceBtn = document.getElementById('add-slice-btn');
let addSliceOn = false;

addSliceBtn.addEventListener('click', () => {
  addSliceOn = !addSliceOn;
  addSliceBtn.textContent = `Add Slice  ${addSliceOn ? 'ON' : 'OFF'}`;
  addSliceBtn.classList.toggle('on', addSliceOn);
  window.api.sendAddSliceMode(addSliceOn);
});

const tsInput    = document.getElementById('ts-input');
const tsApplyBtn = document.getElementById('ts-apply-btn');
const tsClearBtn = document.getElementById('ts-clear-btn');

tsApplyBtn.addEventListener('click', () => {
  const pct = Math.min(100, Math.max(50, Number(tsInput.value)));
  tsInput.value = pct;
  tsApplyBtn.classList.add('active');
  window.api.sendTimestrechState(pct / 100);
});

tsClearBtn.addEventListener('click', () => {
  tsInput.value = 100;
  tsApplyBtn.classList.remove('active');
  window.api.sendTimestrechState(null);
});
