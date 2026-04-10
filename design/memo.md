# github CLI にログイン
gh auth login

# Git 初期化 & 初回コミット
git init
echo "# OTOMORA-D" > README.md
git add .
git commit -m "initial commit"

# コマンドから GitHub リポジトリを作成
gh repo create MORA-STREACH-2 --public --source=. --remote=origin

# GitHub に push
git add .
git commit -m "update"
git push
