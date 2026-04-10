// ── DOM refs ──────────────────────────────────────────
const fileNameEl     = document.getElementById('file-name');
const metaInfoEl     = document.getElementById('meta-info');
const placeholder    = document.getElementById('placeholder');
const waveSection    = document.getElementById('waveform-section');
const canvasWrap     = document.getElementById('canvas-wrap');
const canvas         = document.getElementById('waveform');
const ctx            = canvas.getContext('2d');
const zoomSlider     = document.getElementById('zoom-slider');
const zoomValueEl    = document.getElementById('zoom-value');
const scrollRow      = document.getElementById('scroll-row');
const scrollSlider   = document.getElementById('scroll-slider');
const visibleRangeEl = document.getElementById('visible-range');

// ── レイアウト定数 ────────────────────────────────────
const WORD_LANE_H = 28;   // px (DPR 補正前)
const MORA_LANE_H = 24;   // px
const ANN_H       = WORD_LANE_H + MORA_LANE_H;

// ── オンセット検出パラメータ ──────────────────────────
const FRAME_SIZE     = 64;    // RMS フレームサイズ（サンプル数）約 1.5ms @44100Hz
const MIN_GRADIENT   = 0.01;  // これ未満の RMS 上昇はアタックとみなさない

// ── 状態 ──────────────────────────────────────────────
let currentBuffer      = null;   // AudioBuffer
let currentAnnotations = null;   // JSON data (array of words)
let currentAttacks     = null;   // Map<`${word_id}_${mora_id}`, attackSec>
let currentGridCounts  = null;   // Map<`${word_id}_${mora_id}`, grid_count>
let zoomLevel  = 1;              // 1x ~ 2000x
let scrollNorm = 0;              // 0..1

// ── 再生 ──────────────────────────────────────────────
let audioCtx       = null;   // AudioContext（再利用）
let playingSource  = null;   // 再生中の BufferSourceNode
let clickStartX    = null;   // クリック判定用（mousedown X）
let clickStartY    = null;   // クリック判定用（mousedown Y）
let fadeEnabled      = false;  // win5 の Fade ボタン状態
let addSliceMode     = false;  // win5 の Add Slice モード状態
let timestrechRatio  = null;   // null = off, 0.5〜1.0 = active

// ── ビューキャッシュ（マウス座標変換用）──────────────────
let _viewW      = 0;
let _startSec   = 0;
let _visibleDur = 1;
let _waveH      = 0;

function xToTimeSec(x)  { return _startSec + (x / _viewW) * _visibleDur; }
function timeSecToX(sec){ return (sec - _startSec) / _visibleDur * _viewW; }

// ── ドラッグ状態 ──────────────────────────────────────
let dragKey  = null;   // ドラッグ中の attack key
let dragMora = null;   // クランプ用 mora オブジェクト

const ZOOM_MAX = 2000;

function sliderToZoom(v) {
  return Math.pow(ZOOM_MAX, v / 1000);
}

// ── RMS オンセット検出 ─────────────────────────────────
// 各モーラ範囲内で RMS 勾配が最大のフレームをアタックとして返す
// 戻り値: Map<`${word_id}_${mora_id}`, attackSec>
function detectAttacks(audioBuffer, annotations) {
  const sr    = audioBuffer.sampleRate;
  const ch0   = audioBuffer.getChannelData(0);
  const total = audioBuffer.length;
  const result = new Map();

  for (const word of annotations) {
    for (const mora of word.moras) {
      const key       = `${word.word_id}_${mora.mora_id}`;
      const startSamp = Math.floor(mora.start * sr);
      const endSamp   = Math.min(Math.floor(mora.end * sr), total);

      // フレームが 2 つ未満なら元の start をそのまま使う
      if (endSamp - startSamp < FRAME_SIZE * 2) {
        result.set(key, mora.start);
        continue;
      }

      // フレームごとに RMS を計算
      const frames = [];
      for (let s = startSamp; s < endSamp; s += FRAME_SIZE) {
        const e = Math.min(s + FRAME_SIZE, endSamp);
        let sum = 0;
        for (let i = s; i < e; i++) sum += ch0[i] * ch0[i];
        frames.push({ startSamp: s, rms: Math.sqrt(sum / (e - s)) });
      }

      // 最大 RMS 上昇量のフレームを探す
      let maxDelta  = -Infinity;
      let bestFrame = frames[0];
      for (let i = 1; i < frames.length; i++) {
        const delta = frames[i].rms - frames[i - 1].rms;
        if (delta > maxDelta) { maxDelta = delta; bestFrame = frames[i]; }
      }

      // 上昇量が閾値未満なら元の start を維持（無音・摩擦音などのフォールバック）
      result.set(key, maxDelta >= MIN_GRADIENT ? bestFrame.startSamp / sr : mora.start);
    }
  }

  return result;
}

// ── 描画 ──────────────────────────────────────────────
function draw() {
  if (!currentBuffer) return;

  const dpr  = window.devicePixelRatio || 1;
  const W    = canvasWrap.clientWidth  - 36;
  const H    = canvasWrap.clientHeight - 20;
  const waveH = H - ANN_H;   // 波形エリアの高さ

  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── 時刻計算 ────────────────────────────────────────
  const total          = currentBuffer.length;
  const sr             = currentBuffer.sampleRate;
  const visibleSamples = total / zoomLevel;
  const maxStart       = total - visibleSamples;
  const startSample    = scrollNorm * maxStart;
  const startSec       = startSample / sr;
  const visibleDur     = visibleSamples / sr;

  // ビューキャッシュ更新（マウスイベントで参照）
  _viewW = W; _startSec = startSec; _visibleDur = visibleDur; _waveH = waveH;

  // 時刻 → x 座標（ズーム・スクロール共通）
  function timeToX(sec) {
    return (sec - startSec) / visibleDur * W;
  }

  // ── 背景 ────────────────────────────────────────────
  ctx.fillStyle = addSliceMode ? '#2a0808' : '#0f0f1c';
  ctx.fillRect(0, 0, W, waveH);
  ctx.fillStyle = addSliceMode ? '#220505' : '#0b0b18';
  ctx.fillRect(0, waveH, W, WORD_LANE_H);
  ctx.fillStyle = addSliceMode ? '#1a0404' : '#09090f';
  ctx.fillRect(0, waveH + WORD_LANE_H, W, MORA_LANE_H);

  // レーン区切り線
  ctx.strokeStyle = '#1e1e35';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, waveH);                   ctx.lineTo(W, waveH);
  ctx.moveTo(0, waveH + WORD_LANE_H);     ctx.lineTo(W, waveH + WORD_LANE_H);
  ctx.stroke();

  // ── 波形描画 ─────────────────────────────────────────
  const channels = currentBuffer.numberOfChannels;
  const chH      = waveH / channels;

  for (let ch = 0; ch < channels; ch++) {
    const data = currentBuffer.getChannelData(ch);
    const midY = chH * ch + chH / 2;
    const amp  = (chH / 2) * 0.88;

    ctx.strokeStyle = '#1a1a30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY); ctx.lineTo(W, midY);
    ctx.stroke();

    ctx.fillStyle = ch === 0 ? '#3d7edb' : '#3db87a';

    for (let x = 0; x < W; x++) {
      const s  = startSample + (x / W) * visibleSamples;
      const e  = startSample + ((x + 1) / W) * visibleSamples;
      const si = Math.floor(s);
      const ei = Math.min(Math.ceil(e), total);
      let lo = 0, hi = 0;
      for (let i = si; i < ei; i++) {
        if (data[i] < lo) lo = data[i];
        if (data[i] > hi) hi = data[i];
      }
      const yTop = midY - hi * amp;
      const yBot = midY - lo * amp;
      ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
    }

    ctx.fillStyle = '#363660';
    ctx.font = '10px sans-serif';
    ctx.fillText(`ch${ch + 1}`, 5, chH * ch + 13);
  }

  // ── アノテーション描画 ────────────────────────────────
  if (currentAnnotations) {
    ctx.save();

    for (const word of currentAnnotations) {
      // 可視範囲外の単語をスキップ
      if (word.end < startSec || word.start > startSec + visibleDur) continue;

      const xW = timeToX(word.start);

      // 単語の start ライン（波形 + word レーンを貫く）
      if (xW >= 0 && xW <= W) {
        ctx.strokeStyle = 'rgba(255, 200, 60, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(xW, 0);
        ctx.lineTo(xW, waveH + WORD_LANE_H);
        ctx.stroke();
      }

      // 単語テキスト（word レーン内にクリップ）
      const xWEnd     = timeToX(word.end);
      const clipLeft  = Math.max(xW, 0);
      const clipRight = Math.min(xWEnd, W);
      const clipW     = clipRight - clipLeft;

      if (clipW > 4) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipLeft, waveH + 1, clipW, WORD_LANE_H - 2);
        ctx.clip();
        ctx.fillStyle = '#ffc83c';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(word.word, Math.max(xW + 3, 1), waveH + WORD_LANE_H - 7);
        ctx.restore();
      }

      // モーラ
      for (let mi = 0; mi < word.moras.length; mi++) {
        const mora     = word.moras[mi];
        const nextMora = word.moras[mi + 1];

        if (mora.end < startSec || mora.start > startSec + visibleDur) continue;

        const xM = timeToX(mora.start);

        // モーラ start ライン（波形を点線で、mora レーンを実線で）
        if (xM >= 0 && xM <= W) {
          // 波形エリア: 薄い点線
          ctx.strokeStyle = 'rgba(80, 190, 255, 0.22)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(xM, 0);
          ctx.lineTo(xM, waveH);
          ctx.stroke();

          // mora レーン: 実線
          ctx.strokeStyle = 'rgba(80, 190, 255, 0.6)';
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(xM, waveH + WORD_LANE_H);
          ctx.lineTo(xM, H);
          ctx.stroke();
        }

        // アタックポイント線（RMS オンセット検出結果）
        if (currentAttacks) {
          const attackSec = currentAttacks.get(`${word.word_id}_${mora.mora_id}`);
          if (attackSec !== undefined) {
            const xA = timeToX(attackSec);
            if (xA >= 0 && xA <= W) {
              // 波形エリア: オレンジ実線
              ctx.strokeStyle = 'rgba(255, 140, 50, 0.7)';
              ctx.lineWidth = 1;
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(xA, 0);
              ctx.lineTo(xA, waveH);
              ctx.stroke();

              // mora レーン: オレンジ実線
              ctx.strokeStyle = 'rgba(255, 140, 50, 0.9)';
              ctx.beginPath();
              ctx.moveTo(xA, waveH + WORD_LANE_H);
              ctx.lineTo(xA, H);
              ctx.stroke();

              // mora レーン上端に小さな三角マーカー（▼）
              ctx.fillStyle = '#ff8c32';
              ctx.beginPath();
              ctx.moveTo(xA,     waveH + WORD_LANE_H + 2);
              ctx.lineTo(xA - 4, waveH + WORD_LANE_H + 9);
              ctx.lineTo(xA + 4, waveH + WORD_LANE_H + 9);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // grid_count 数値（波形エリア中央）
        if (currentAttacks && currentGridCounts) {
          const key    = `${word.word_id}_${mora.mora_id}`;
          const atkSec = currentAttacks.get(key);
          if (atkSec !== undefined) {
            const xA = timeToX(atkSec);
            const xE = timeToX(mora.end);
            const cx = (xA + xE) / 2;
            if (cx >= 0 && cx <= W) {
              const gc = currentGridCounts.get(key) ?? 1;
              ctx.fillStyle    = 'rgba(255, 255, 255, 0.55)';
              ctx.font         = 'bold 13px sans-serif';
              ctx.textAlign    = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(gc), cx, waveH / 2);
              ctx.textAlign    = 'left';
              ctx.textBaseline = 'alphabetic';
            }
          }
        }

        // モーラテキスト（次のモーラ start または mora.end でクリップ）
        const xMEnd    = nextMora ? timeToX(nextMora.start) : timeToX(mora.end);
        const mClipL   = Math.max(xM, 0);
        const mClipR   = Math.min(xMEnd, W);
        const mClipW   = mClipR - mClipL;

        if (mClipW > 3) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(mClipL, waveH + WORD_LANE_H + 1, mClipW, MORA_LANE_H - 2);
          ctx.clip();
          ctx.fillStyle = '#50beff';
          ctx.font = '11px sans-serif';
          ctx.fillText(mora.text, Math.max(xM + 2, 1), H - 6);
          ctx.restore();
        }
      }
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── UI 更新 ──────────────────────────────────────────
  const endSec = startSec + visibleDur;
  visibleRangeEl.textContent = `${fmtSec(startSec)} ~ ${fmtSec(endSec)}`;

  const showScroll = zoomLevel > 1.001;
  scrollRow.classList.toggle('visible', showScroll);
  if (!showScroll) { scrollNorm = 0; scrollSlider.value = 0; }
}

function fmtSec(sec) {
  if (zoomLevel < 10)   return sec.toFixed(3) + 's';
  if (zoomLevel < 100)  return sec.toFixed(4) + 's';
  if (zoomLevel < 1000) return sec.toFixed(5) + 's';
  return sec.toFixed(6) + 's';
}

// ── スライダー ────────────────────────────────────────
zoomSlider.addEventListener('input', () => {
  zoomLevel = sliderToZoom(Number(zoomSlider.value));
  const label = zoomLevel < 10
    ? `×${zoomLevel.toFixed(1)}`
    : `×${Math.round(zoomLevel).toLocaleString()}`;
  zoomValueEl.textContent = label;
  scrollNorm = Math.min(scrollNorm, 1);
  draw();
});

scrollSlider.addEventListener('input', () => {
  scrollNorm = Number(scrollSlider.value) / 10000;
  draw();
});

// ── データ受信 ────────────────────────────────────────
function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

window.api.onShowWaveform(async ({ name, buffer, annotations }) => {
  fileNameEl.textContent = name;
  zoomSlider.value = 0; scrollSlider.value = 0;
  zoomLevel = 1; scrollNorm = 0;
  zoomValueEl.textContent = '×1.0';
  visibleRangeEl.textContent = '';

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(toArrayBuffer(buffer));

    currentBuffer      = audioBuffer;
    currentAnnotations = annotations;
    currentAttacks     = annotations ? detectAttacks(audioBuffer, annotations) : null;

    // grid_count 初期化（全モーラを 1 で初期化）
    currentGridCounts = new Map();
    if (annotations) {
      for (const word of annotations) {
        for (const mora of word.moras) {
          currentGridCounts.set(`${word.word_id}_${mora.mora_id}`, 1);
        }
      }
    }

    // アタック結果を win4 へ送信
    if (currentAttacks && annotations) {
      const payload = [];
      for (const word of annotations) {
        for (const mora of word.moras) {
          const key       = `${word.word_id}_${mora.mora_id}`;
          const attackSec = currentAttacks.get(key);
          if (attackSec !== undefined) {
            payload.push({
              word_id:    word.word_id,
              mora_id:    mora.mora_id,
              attackSec,
              isFallback: Math.abs(attackSec - mora.start) < 0.0001,
              grid_count: 1,
            });
          }
        }
      }
      window.api.sendAttacks(payload);
    }

    metaInfoEl.textContent =
      `${audioBuffer.numberOfChannels}ch · ${audioBuffer.sampleRate.toLocaleString()} Hz · ${audioBuffer.duration.toFixed(3)}s`;

    placeholder.style.display = 'none';
    waveSection.classList.add('visible');

    requestAnimationFrame(draw);
  } catch (err) {
    placeholder.textContent = `デコードエラー: ${err.message}`;
    placeholder.style.display = 'flex';
    waveSection.classList.remove('visible');
  }
});

// ── フェード状態受信 ──────────────────────────────────────
window.api.onFadeChanged((enabled) => { fadeEnabled = enabled; });

// ── Timestretch 状態受信 ──────────────────────────────────
window.api.onTimestrechChanged((ratio) => { timestrechRatio = ratio; });

// ── Export ────────────────────────────────────────────────
window.api.onTriggerExport(() => {
  if (!currentBuffer || !currentAnnotations || !currentAttacks) return;

  const sr       = currentBuffer.sampleRate;
  const numCh    = currentBuffer.numberOfChannels;
  const FADE_SEC = 0.01;
  const fadeSamp = Math.floor(FADE_SEC * sr);
  const hasAudio = fadeEnabled || timestrechRatio !== null;

  // オーディオ出力バッファ（元と同じ長さ、ゼロ初期化）
  let outChannels = null;
  if (hasAudio) {
    outChannels = Array.from({ length: numCh }, () => new Float32Array(currentBuffer.length));
  }

  // 出力 JSON: 元の構造をディープコピーしてから更新
  const outAnnotations = JSON.parse(JSON.stringify(currentAnnotations));

  for (const word of outAnnotations) {
    const outMoras = [];
    for (const mora of word.moras) {
      const key       = `${word.word_id}_${mora.mora_id}`;
      const attackSec = currentAttacks.get(key) ?? mora.start;
      const gridCount = currentGridCounts?.get(key) ?? 1;

      const startSamp = Math.floor(attackSec * sr);
      const endSamp   = Math.min(Math.floor(mora.end * sr), currentBuffer.length);
      const inLen     = endSamp - startSamp;

      let procLen = inLen;

      if (hasAudio && inLen > 0) {
        // 元バッファから区間を抽出
        const channelsIn = [];
        for (let ch = 0; ch < numCh; ch++) {
          channelsIn.push(currentBuffer.getChannelData(ch).slice(startSamp, endSamp));
        }

        // タイムストレッチ
        let channelsProc = timestrechRatio !== null
          ? stretchChannels(channelsIn, timestrechRatio)
          : channelsIn;

        // フェード（in-place）
        if (fadeEnabled) {
          for (const ch of channelsProc) {
            const len  = ch.length;
            const fade = Math.min(fadeSamp, Math.floor(len / 2));
            for (let i = 0; i < fade; i++) {
              ch[i]           *= i / fade;
              ch[len - 1 - i] *= i / fade;
            }
          }
        }

        procLen = channelsProc[0].length;

        // attackSec の位置に書き込む（元と同じタイムライン上に配置）
        const writeEnd = Math.min(startSamp + procLen, currentBuffer.length);
        const writeLen = writeEnd - startSamp;
        for (let ch = 0; ch < numCh; ch++) {
          outChannels[ch].set(channelsProc[ch].subarray(0, writeLen), startSamp);
        }
      }

      const procDur = procLen / sr;

      outMoras.push({
        mora_id:           mora.mora_id,
        slice_id:          mora.slice_id,
        text:              mora.text,
        start:             attackSec,
        end:               attackSec + procDur,
        duration:          procDur,
        rms:               mora.rms,
        f0:                mora.f0,
        spectral_centroid: mora.spectral_centroid,
        zcr:               mora.zcr,
        grid_count:        gridCount,
      });
    }
    word.moras = outMoras;
  }

  const baseName = fileNameEl.textContent.replace(/\.[^.]+$/, '');
  window.api.sendExportData({ name: baseName, sampleRate: sr, channels: outChannels, annotations: outAnnotations });
});

// ── Add Slice モード受信 ──────────────────────────────────
window.api.onAddSliceMode((enabled) => {
  addSliceMode = enabled;
  document.body.classList.toggle('add-slice-mode', enabled);
  draw();
});

// ── 追加モーラの復元（restore-attacks より前に処理される）──
window.api.onRestoreAddedMoras((items) => {
  if (!currentAnnotations) return;
  for (const { word_id, prevMoraId, mora, attackSec } of items) {
    const word = currentAnnotations.find(w => w.word_id === word_id);
    if (!word) continue;
    // 既に挿入済みならスキップ
    if (word.moras.some(m => m.mora_id === mora.mora_id)) continue;
    const prevIdx = word.moras.findIndex(m => m.mora_id === prevMoraId);
    if (prevIdx < 0) continue;
    word.moras.splice(prevIdx + 1, 0, { ...mora });
    const key = `${word_id}_${mora.mora_id}`;
    if (!currentAttacks)    currentAttacks    = new Map();
    if (!currentGridCounts) currentGridCounts = new Map();
    currentAttacks.set(key, attackSec);
    currentGridCounts.set(key, 1);
  }
  draw();
});

// ── .mora ファイルからアタック復元 ───────────────────────
window.api.onRestoreAttacks((attacks) => {
  if (!currentAttacks)    currentAttacks    = new Map();
  if (!currentGridCounts) currentGridCounts = new Map();
  for (const { word_id, mora_id, attackSec, grid_count } of attacks) {
    currentAttacks.set(`${word_id}_${mora_id}`, attackSec);
    currentGridCounts.set(`${word_id}_${mora_id}`, grid_count ?? 1);
  }
  draw();
});

// ── アタックドラッグ ──────────────────────────────────
const HIT_RADIUS = 10; // px
const GRID_CYCLE = [1, 0, 3, 2]; // grid_count クリックサイクル

function nextGridCount(current) {
  const idx = GRID_CYCLE.indexOf(current);
  return idx === -1 ? 0 : GRID_CYCLE[(idx + 1) % GRID_CYCLE.length];
}

function findGridCountAt(mouseX, mouseY) {
  if (!currentGridCounts || !currentAnnotations || !currentAttacks || _viewW === 0) return null;
  const GC_HIT = 12; // px
  for (const word of currentAnnotations) {
    for (const mora of word.moras) {
      const key    = `${word.word_id}_${mora.mora_id}`;
      const atkSec = currentAttacks.get(key);
      if (atkSec === undefined) continue;
      const cx = (timeSecToX(atkSec) + timeSecToX(mora.end)) / 2;
      const cy = _waveH / 2;
      if (Math.abs(mouseX - cx) < GC_HIT && Math.abs(mouseY - cy) < GC_HIT) {
        return { key, word_id: word.word_id, mora_id: mora.mora_id };
      }
    }
  }
  return null;
}

function findNearestAttack(mouseX) {
  if (!currentAttacks || !currentAnnotations || _viewW === 0) return null;
  let best = null, bestDist = HIT_RADIUS;
  for (const word of currentAnnotations) {
    for (const mora of word.moras) {
      const key = `${word.word_id}_${mora.mora_id}`;
      const sec = currentAttacks.get(key);
      if (sec === undefined) continue;
      const dist = Math.abs(mouseX - timeSecToX(sec));
      if (dist < bestDist) { bestDist = dist; best = { key, mora }; }
    }
  }
  return best;
}

function stretchChannels(channelsData, ratio) {
  const ST = window._SoundTouch;
  if (!ST) return channelsData; // モジュール未ロードなら無処理
  const left  = channelsData[0];
  const right = channelsData.length > 1 ? channelsData[1] : channelsData[0];
  const inLen = left.length;
  const PADDING = 8192;

  const interleaved = new Float32Array((inLen + PADDING) * 2);
  for (let i = 0; i < inLen; i++) {
    interleaved[i * 2]     = left[i];
    interleaved[i * 2 + 1] = right[i];
  }

  const st = new ST();
  st.tempo = 1 / ratio; // 50% → 2倍速 → 長さ半分
  st._inputBuffer.putSamples(interleaved, 0, inLen + PADDING);

  let iter = 0;
  while ((st._inputBuffer.frameCount > 0 || st._intermediateBuffer.frameCount > 0) && iter++ < 2000) {
    st.process();
  }

  const expectedLen = Math.ceil(inLen * ratio); // 50% → 半分の長さ
  const outFrames   = Math.min(st._outputBuffer.frameCount, expectedLen);
  const outBuf      = new Float32Array(outFrames * 2);
  st._outputBuffer.extract(outBuf, 0, outFrames);

  const outLeft  = new Float32Array(outFrames);
  const outRight = new Float32Array(outFrames);
  for (let i = 0; i < outFrames; i++) {
    outLeft[i]  = outBuf[i * 2];
    outRight[i] = outBuf[i * 2 + 1];
  }
  return channelsData.length === 1 ? [outLeft] : [outLeft, outRight];
}

function playRegionAt(mouseX) {
  if (!currentBuffer || !currentAnnotations || !currentAttacks || !audioCtx) return;
  const clickSec = xToTimeSec(mouseX);

  for (const word of currentAnnotations) {
    for (const mora of word.moras) {
      const key       = `${word.word_id}_${mora.mora_id}`;
      const attackSec = currentAttacks.get(key);
      if (attackSec === undefined) continue;
      if (clickSec >= attackSec && clickSec < mora.end) {
        if (playingSource) { try { playingSource.stop(); } catch {} }

        if (timestrechRatio !== null) {
          // タイムストレッチ: 元バッファから区間を抽出してオフライン処理
          const sr        = currentBuffer.sampleRate;
          const startSamp = Math.floor(attackSec * sr);
          const endSamp   = Math.floor(mora.end * sr);
          const channelsIn = [];
          for (let ch = 0; ch < currentBuffer.numberOfChannels; ch++) {
            channelsIn.push(currentBuffer.getChannelData(ch).slice(startSamp, endSamp));
          }
          const channelsOut   = stretchChannels(channelsIn, timestrechRatio);
          const stretchedLen  = channelsOut[0].length;
          const stretchedDur  = stretchedLen / sr;
          const stretchedBuf  = audioCtx.createBuffer(channelsOut.length, stretchedLen, sr);
          for (let ch = 0; ch < channelsOut.length; ch++) {
            stretchedBuf.copyToChannel(channelsOut[ch], ch);
          }

          playingSource        = audioCtx.createBufferSource();
          playingSource.buffer = stretchedBuf;

          if (fadeEnabled && stretchedDur > 0.02) {
            const gain = audioCtx.createGain();
            const now  = audioCtx.currentTime;
            const fSec = 0.01;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1, now + fSec);
            gain.gain.setValueAtTime(1, now + stretchedDur - fSec);
            gain.gain.linearRampToValueAtTime(0, now + stretchedDur);
            playingSource.connect(gain);
            gain.connect(audioCtx.destination);
          } else {
            playingSource.connect(audioCtx.destination);
          }
          playingSource.start(0);
        } else {
          // 通常再生
          const duration       = mora.end - attackSec;
          playingSource        = audioCtx.createBufferSource();
          playingSource.buffer = currentBuffer;

          if (fadeEnabled && duration > 0.02) {
            const gain  = audioCtx.createGain();
            const now   = audioCtx.currentTime;
            const fSec  = 0.01;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1, now + fSec);
            gain.gain.setValueAtTime(1, now + duration - fSec);
            gain.gain.linearRampToValueAtTime(0, now + duration);
            playingSource.connect(gain);
            gain.connect(audioCtx.destination);
          } else {
            playingSource.connect(audioCtx.destination);
          }
          playingSource.start(0, attackSec, duration);
        }
        return;
      }
    }
  }
}

// ── Add Slice ─────────────────────────────────────────

function detectAttackForMora(mora) {
  if (!currentBuffer) return mora.start;
  const sr       = currentBuffer.sampleRate;
  const ch0      = currentBuffer.getChannelData(0);
  const total    = currentBuffer.length;
  const startSamp = Math.floor(mora.start * sr);
  const endSamp   = Math.min(Math.floor(mora.end * sr), total);
  if (endSamp - startSamp < FRAME_SIZE * 2) return mora.start;

  const frames = [];
  for (let s = startSamp; s < endSamp; s += FRAME_SIZE) {
    const e = Math.min(s + FRAME_SIZE, endSamp);
    let sum = 0;
    for (let i = s; i < e; i++) sum += ch0[i] * ch0[i];
    frames.push({ startSamp: s, rms: Math.sqrt(sum / (e - s)) });
  }
  let maxDelta = -Infinity, bestFrame = frames[0];
  for (let i = 1; i < frames.length; i++) {
    const delta = frames[i].rms - frames[i - 1].rms;
    if (delta > maxDelta) { maxDelta = delta; bestFrame = frames[i]; }
  }
  return maxDelta >= MIN_GRADIENT ? bestFrame.startSamp / sr : mora.start;
}

function showTextInput(canvasX, canvasY, onConfirm) {
  const rect  = canvas.getBoundingClientRect();
  const input = document.createElement('input');
  input.type        = 'text';
  input.placeholder = 'テキスト入力 → Enter';
  input.style.cssText = `
    position: fixed;
    left: ${rect.left + canvasX - 60}px;
    top:  ${rect.top  + canvasY - 13}px;
    width: 120px;
    background: #1a0808;
    color: #fff;
    border: 1px solid #ff6060;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 13px;
    z-index: 9999;
    outline: none;
  `;
  document.body.appendChild(input);
  input.focus();

  let done = false;
  const confirm = () => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (document.body.contains(input)) document.body.removeChild(input);
    onConfirm(val);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { confirm(); }
    if (e.key === 'Escape') {
      done = true;
      if (document.body.contains(input)) document.body.removeChild(input);
    }
  });
  input.addEventListener('blur', confirm);
}

function addSliceAt(mouseX) {
  if (!currentBuffer || !currentAnnotations || _viewW === 0) return;
  const T = xToTimeSec(mouseX);

  // T を含む word と mora を探す
  let targetWord  = null;
  let prevMoraIdx = -1;
  for (const word of currentAnnotations) {
    if (T < word.start || T > word.end) continue;
    for (let i = 0; i < word.moras.length; i++) {
      const m = word.moras[i];
      if (T >= m.start && T <= m.end) { targetWord = word; prevMoraIdx = i; break; }
    }
    if (targetWord) break;
  }
  if (!targetWord || prevMoraIdx < 0) return;

  const prevMora = targetWord.moras[prevMoraIdx];
  const origEnd  = prevMora.end;

  // prevMora を T で切り詰め
  const prevKey    = `${targetWord.word_id}_${prevMora.mora_id}`;
  const prevAttack = currentAttacks.get(prevKey) ?? prevMora.start;
  prevMora.end      = T;
  prevMora.duration = T - prevMora.start;
  if (prevAttack > T) currentAttacks.set(prevKey, prevMora.start);

  // 新モーラを生成
  const maxMoraId = Math.max(...targetWord.moras.map(m => m.mora_id));
  const newMoraId = maxMoraId + 1;
  const newMora = {
    slice_id:          prevMora.slice_id + 1,
    mora_id:           newMoraId,
    text:              '',
    start:             T,
    end:               origEnd,
    duration:          origEnd - T,
    rms:               prevMora.rms,
    f0:                prevMora.f0,
    spectral_centroid: prevMora.spectral_centroid,
    zcr:               prevMora.zcr,
  };
  targetWord.moras.splice(prevMoraIdx + 1, 0, newMora);

  // attack 検出 + grid_count 初期化
  const newKey    = `${targetWord.word_id}_${newMoraId}`;
  const newAttack = detectAttackForMora(newMora);
  currentAttacks.set(newKey, newAttack);
  currentGridCounts.set(newKey, 1);
  draw();

  // テキスト入力オーバーレイ
  const cx = (timeSecToX(newAttack) + timeSecToX(origEnd)) / 2;
  const cy = _waveH / 2;
  showTextInput(cx, cy, (text) => {
    newMora.text = text;
    draw();
    // main の attacksCache を更新
    window.api.sendAttacks([{
      word_id:    targetWord.word_id,
      mora_id:    newMoraId,
      attackSec:  newAttack,
      isFallback: false,
      grid_count: 1,
    }]);
    // win4 へ新モーラ情報を送信（Step 4）
    window.api.sendMoraAdded({
      word_id:    targetWord.word_id,
      prevMoraId: prevMora.mora_id,
      mora:       { ...newMora },
      attackSec:  newAttack,
    });
  });
}

canvas.addEventListener('mousedown', (e) => {
  if (addSliceMode) {
    clickStartX = e.offsetX;
    clickStartY = e.offsetY;
    return;
  }
  const hit = findNearestAttack(e.offsetX);
  if (hit) {
    dragKey     = hit.key;
    dragMora    = hit.mora;
    clickStartX = null;
    clickStartY = null;
    e.preventDefault();
  } else {
    clickStartX = e.offsetX;
    clickStartY = e.offsetY;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (addSliceMode) {
    canvas.style.cursor = 'crosshair';
    return;
  }
  const mouseX = e.offsetX;
  if (dragKey) {
    let newSec = xToTimeSec(mouseX);
    newSec = Math.max(dragMora.start, Math.min(dragMora.end, newSec));
    currentAttacks.set(dragKey, newSec);
    draw();
    const [word_id, mora_id] = dragKey.split('_').map(Number);
    window.api.sendAttacks([{ word_id, mora_id, attackSec: newSec, isFallback: false, grid_count: currentGridCounts?.get(dragKey) ?? 1 }]);
    return;
  }
  canvas.style.cursor = findNearestAttack(mouseX) ? 'ew-resize' : 'default';
});

canvas.addEventListener('mouseup', (e) => {
  if (addSliceMode) {
    if (clickStartX !== null && Math.abs(e.offsetX - clickStartX) < 5) {
      addSliceAt(e.offsetX);
    }
    clickStartX = null;
    clickStartY = null;
    return;
  }
  if (dragKey) {
    dragKey = null; dragMora = null;
  } else if (clickStartX !== null && Math.abs(e.offsetX - clickStartX) < 5) {
    const gcHit = findGridCountAt(e.offsetX, e.offsetY);
    if (gcHit) {
      const newGc = nextGridCount(currentGridCounts.get(gcHit.key) ?? 1);
      currentGridCounts.set(gcHit.key, newGc);
      draw();
      const attackSec = currentAttacks.get(gcHit.key);
      window.api.sendAttacks([{ word_id: gcHit.word_id, mora_id: gcHit.mora_id, attackSec, isFallback: false, grid_count: newGc }]);
    } else {
      playRegionAt(e.offsetX);
    }
  }
  clickStartX = null;
  clickStartY = null;
});
canvas.addEventListener('mouseleave', () => { dragKey = null; dragMora = null; clickStartX = null; clickStartY = null; });
