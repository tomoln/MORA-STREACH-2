# github CLI にログイン
gh auth login

# Git 初期化 & 初回コミット
git init
echo "# OTOMORA-D" > README.md
git add .
git commit -m "initial commit"

# コマンドから GitHub リポジトリを作成
gh repo create OTOMORA-D --public --source=. --remote=origin

# GitHub に push
git push -u origin main
