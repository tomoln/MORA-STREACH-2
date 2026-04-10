工程は4ステップ、確認4回です。

Step 1: win5 ボタン追加 + IPC 中継

win5/index.html：Add Slice ボタン追加
win5/renderer.js：ON/OFF トグル + IPC 送信
win5/preload：sendAddSliceMode 追加
ipc.js：add-slice-mode → win3 中継
確認：ボタンが表示され押すたびに ON/OFF が切り替わる（win3 の見た目変化はまだない）

Step 2: win3 モード受信 + 背景色変化

win3/preload：onAddSliceMode 追加
win3/renderer.js：フラグ管理 + draw() でキャンバス背景を赤系色に変更
確認：Add Slice ON → win3 が赤っぽくなる、OFF → 元に戻る

Step 3: win3 クリック → モーラ追加 + テキスト入力 + 再描画

win3/renderer.js：
クリック位置の word を特定
モーラ分割（既存 end を T に、新モーラを T〜元 end で生成）
attackSec を RMS 検出（detectAttacks の単モーラ版）
grid_count = 1
HTML テキスト入力オーバーレイ表示 → 確定
currentAnnotations / currentAttacks / currentGridCounts 更新
再描画 + sendAttacks（main の attacksCache が自動更新 → .mora 保存も自動対応）
確認：クリック → テキスト入力 → 確定 → win3 に新モーラが描画される / Ctrl+S → 再読み込みで attack・grid_count が復元される

Step 4: win4 への反映

新 IPC mora-added（win3 → main → win4）で新モーラ情報を送信
win4/preload：onMoraAdded 追加
win4/renderer.js：既存テーブルに時刻順で行を挿入
確認：win3 で追加 → win4 の該当単語の中に新モーラ行が入り、attack 値と grid_count（1）が表示される