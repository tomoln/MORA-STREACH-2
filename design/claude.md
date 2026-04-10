# Mora Streach — プロジェクト概要

日本語音声のモーラ単位サンプラーツール。
オーディオ + タイムスタンプ JSON を読み込み、モーラのアタックポイントを検知・調整する。

`npm start` で起動。Electron アプリ、5ウィンドウ同時起動。

---

## ウィンドウの役割

| win | タイトル | 役割 |
|-----|---------|------|
| win1 | Mora Streach | D&D ドロップゾーン |
| win2 | Assets Browser | assets/audio・json のファイル一覧 |
| win3 | Waveform | 波形表示・アタックドラッグ・モーラ再生・Add Slice |
| win4 | Annotations | 単語・モーラ一覧テーブル（アコーディオン）|
| win5 | Controls | Fade ボタン・Add Slice ボタン・Timestretch |

---

## 音声ロードフロー（重要）

```
win2 drag → win1 drop
  → IPC: audio-dropped
  → main: audio読み込み + 同名JSON読み込み
  → win3: show-waveform → デコード → detectAttacks() → attacks-ready
  → main: .mora が存在すれば自動復元（autoImportDone フラグで1回限り）
      復元順序: restore-added-moras → restore-attacks  ← 順序厳守
  → win4: show-annotations / show-attacks
```

---

## .mora ファイル（assets/mora/{name}.mora）

```json
{
  "source": "001",
  "attacks": [
    { "word_id": 1, "mora_id": 1, "attackSec": 0.334, "isFallback": false, "grid_count": 1 }
  ],
  "addedMoras": [
    { "word_id": 1, "prevMoraId": 2, "mora": { "mora_id": 5, "text": "ん", "start": 0.72, "end": 0.85, ... } }
  ],
  "moraEndUpdates": [
    { "word_id": 1, "mora_id": 3, "end": 0.65, "duration": 0.12 }
  ]
}
```

- `addedMoras`: Add Slice で追加したモーラ構造。復元時に先に挿入してから attacks を適用する。
- `moraEndUpdates`: 隙間挿入時にトリムされたmoraのend更新。復元順序: restore-added-moras → restore-mora-end-updates → restore-attacks。
- rms / f0 / spectral_centroid / zcr は追加時に1つ前のモーラの値を引き継ぐ。

---

## Export（File → Export / Ctrl+E）

出力先: `assets/out/{name}.json` と `assets/out/{name}.wav`（条件付き）

**JSON**: 現在のアノテーション情報をそのまま出力。各モーラの `start` は attackSec の値で上書き。`zcr` の後に `grid_count` を追加。

**WAV**: fade ON または timestretch 適用中のときのみ出力。各モーラの attackSec〜mora.end を元バッファから切り出し、処理（timestretch → fade の順）して元と同じタイムライン上の attackSec 位置に配置した1本のファイル。

---

## 非自明な仕様

**grid_count**
- 各モーラが持つ整数値。初期値 1。
- win3 波形中央に白数字で表示。クリックサイクル: `1 → 0 → 3 → 2 → 1`
- .mora に保存・復元される。

**RMS オンセット検出**
- `detectAttacks()` / `detectAttackForMora()`: スキャン範囲は `mora.start ～ mora.start + 0.1s`（mora.end でクリップ）
- スキャン範囲内で RMS 上昇量が最大のフレームをアタックポイントとする
- 上昇量が MIN_GRADIENT(0.01) 未満なら mora.start にフォールバック

**Add Slice モード**
- win5 ボタン ON → win3 背景が赤系に変わる
- win3 でクリック位置 T を判定:
  - **通常ケース**: T が mora.start～mora.end 内 → prevMora を T で切り詰め、新モーラを `[T, 元end]` で挿入
  - **隙間挿入ケース**: T が word 範囲内だがどの mora にもヒットしない → prevMora を切り詰めず、`[T, 次mora.start or word.end]` で挿入。T をまたぐ mora（他word含む）があればその end を T に更新（`moraEndUpdates` に保存）
- `prevMoraId=0` は「そのwordの先頭に挿入」を意味する（win3/win4 の restore で先頭挿入として処理）
- 新モーラの attack は RMS 検出（`detectAttackForMora`）、grid_count=1
- テキスト入力オーバーレイ（赤枠 input）で mora.text を設定
- IPC `mora-added` で main の `addedMorasCache` に保存 → win4 に行挿入
- IPC `mora-end-updated` で main の `moraEndUpdatesCache` に保存 → win4 の end/duration 表示を更新

**playRegionAt（win3 クリック再生）**
- クリック位置を含む mora が複数ある場合（隙間挿入による時間重複）、attackSec が最大の mora を優先して再生

**Timestretch**
- win5 の数値入力（50〜100%）+ Apply / Clear ボタン
- 50% = モーラの長さが半分（2倍速）、100% = 通常
- IPC: `timestretch-changed` を win5→main→win3 で中継、win3 が `timestrechRatio` を保持
- soundtouchjs を win3/index.html の `<script type="module">` で読み込み `window._SoundTouch` に格納
- 処理は win3/renderer.js の `stretchChannels()` でオフライン処理（元バッファから毎回）
- `st.tempo = 1 / ratio`（50% → tempo=2.0）、末尾に 8192 サンプルのゼロパディングでフラッシュ

**Fade**
- win5 ON 時、モーラ再生に fade-in/out 10ms を GainNode で適用
- 常に元の AudioBuffer から処理（二重 fade 防止）
- Export 時は Float32Array に直接適用（GainNode は使わない）
- 処理順: タイムストレッチ → フェード

**autoImportDone フラグ**
- attacks-ready IPC のたびに .mora が自動適用されるのを防ぐ1回限りのガード
- audio-dropped 時にリセット
