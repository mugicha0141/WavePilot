# Git・GitHub 操作ガイド

このドキュメントは WavePilot 開発で使用した Git コマンドと GitHub の操作方法をまとめたものです。

---

## 目次

1. [Git とは](#1-git-とは)
2. [基本コマンド](#2-基本コマンド)
3. [ブランチ操作](#3-ブランチ操作)
4. [リモートリポジトリ（GitHub）との連携](#4-リモートリポジトリgithubとの連携)
5. [PR（Pull Request）の作り方](#5-prpull-requestの作り方)
6. [このプロジェクトの開発フロー](#6-このプロジェクトの開発フロー)
7. [よくあるトラブルと対処法](#7-よくあるトラブルと対処法)

---

## 1. Git とは

ファイルの変更履歴を管理するツールです。「いつ・誰が・何を変更したか」を記録し、過去の状態に戻したり、複数人で同じコードを編集したりできます。

### 基本的な概念

| 用語 | 意味 |
| :--- | :--- |
| **リポジトリ（repo）** | Git で管理するプロジェクトのフォルダ |
| **コミット** | 変更内容を記録する操作（セーブポイントのイメージ） |
| **ブランチ** | 独立した作業ラインを作る機能 |
| **マージ** | ブランチの変更を別のブランチに取り込む操作 |
| **ローカル** | 自分のPC上のリポジトリ |
| **リモート** | GitHub などのサーバー上のリポジトリ |

### 作業の基本サイクル

```
ファイルを編集
  ↓
git add（変更をステージングに追加）
  ↓
git commit（変更を記録）
  ↓
git push（GitHub にアップロード）
```

---

## 2. 基本コマンド

### リポジトリの初期化・クローン

```bash
# 新規リポジトリを作成
git init

# GitHub からリポジトリをローカルにコピー
git clone https://github.com/mugicha0141/WavePilot.git
```

### 変更の確認

```bash
# 現在の変更状況を確認
git status

# 変更内容の差分を確認
git diff

# ステージング済みの差分を確認
git diff --cached
```

`git status` の見方：

```
Changes not staged for commit:   ← まだ add していない変更
  modified: server/server.js

Untracked files:                 ← Git 管理外の新規ファイル
  AWS_GUIDE.md
```

### ステージング（add）

```bash
# 特定のファイルをステージング
git add server/server.js

# 複数ファイルをステージング
git add server/server.js client/src/pages/Home.css

# カレントディレクトリ以下の全変更をステージング
git add .
```

> `.env` や秘密鍵などの機密ファイルを誤って `git add .` で追加しないよう注意。`.gitignore` で管理外にしておくことが重要。

### コミット

```bash
# コミット（メッセージを付けて記録）
git commit -m "feat: お気に入り登録機能を追加"

# ステージングと同時にコミット（新規ファイルは対象外）
git commit -am "fix: バグ修正"
```

**コミットメッセージの書き方（このプロジェクトの慣習）**

| プレフィックス | 用途 |
| :--- | :--- |
| `feat:` | 新機能の追加 |
| `fix:` | バグ修正 |
| `docs:` | ドキュメントのみの変更 |
| `refactor:` | 機能変更を伴わないコード整理 |
| `chore:` | ビルド設定・依存関係の更新など |

```bash
# 良い例
git commit -m "feat: LINE通知機能を追加"
git commit -m "fix: StormglassAPIのリクエストにwindSpeedを追加"
git commit -m "docs: AWSサービス解説ガイドを追加"
```

### 履歴の確認

```bash
# コミット履歴を確認
git log

# 1行で簡潔に表示
git log --oneline

# 最新5件だけ表示
git log --oneline -5
```

```
# git log --oneline の出力例
abfe977 docs: DynamoDB型変換・データ表示フロー・React keyの解説を追記
fc07dba docs: Lambda・serverless-httpのリクエスト変換フローを詳細追記
cdace4a docs: AWSサービス解説ガイドを追加
```

---

## 3. ブランチ操作

### ブランチとは

本流（main）から独立した作業ラインです。新機能開発や修正を main に影響を与えずに進められます。

```
main ─────────────────────────────→
         └─ feature/line-notification ─→ マージ
```

### ブランチの基本操作

```bash
# ブランチ一覧を確認
git branch

# リモート含む全ブランチを確認
git branch -a

# 新しいブランチを作成して切り替え
git checkout -b feature/line-notification

# 既存のブランチに切り替え
git checkout main

# ブランチを削除
git branch -d feature/line-notification
```

### マージ

```bash
# main ブランチに feature ブランチをマージ
git checkout main
git merge feature/line-notification
```

### rebase

```bash
# feature ブランチを main の最新状態に追従させる
git checkout feature/line-notification
git rebase main
```

`merge` との違い：
| | merge | rebase |
| :--- | :--- | :--- |
| 履歴 | マージコミットが残る | 履歴が一直線になる |
| 用途 | PR のマージ | feature ブランチを最新 main に追従 |

---

## 4. リモートリポジトリ（GitHub）との連携

### push / pull

```bash
# ローカルの変更を GitHub にアップロード
git push origin main

# 初回 push（ブランチのトラッキング設定も行う）
git push -u origin feature/line-notification

# GitHub の最新変更をローカルに取得
git pull origin main
```

### fetch

```bash
# リモートの変更情報だけ取得（ローカルには反映しない）
git fetch origin

# fetch 後に差分確認
git diff origin/main
```

`pull` は `fetch + merge` を同時に行います。差分を確認してからマージしたい場合は `fetch` を使います。

### リモートの確認

```bash
# リモートリポジトリの URL を確認
git remote -v

# 出力例
origin  https://github.com/mugicha0141/WavePilot.git (fetch)
origin  https://github.com/mugicha0141/WavePilot.git (push)
```

---

## 5. PR（Pull Request）の作り方

PR はブランチの変更を main に取り込む前にレビューを依頼する仕組みです。

### GitHub の画面から作成する場合

1. GitHub のリポジトリページを開く
2. `Pull requests` タブ → `New pull request`
3. `base: main` ← `compare: feature/line-notification` を選択
4. タイトル・説明を記入して `Create pull request`

### gh コマンドから作成する場合

```bash
# GitHub CLI のインストール
brew install gh

# GitHub にログイン
gh auth login

# PR を作成
gh pr create --title "feat: LINE通知機能の追加" --body "## Summary
- 通知設定機能を追加
- LINE Messaging API との連携"

# PR 一覧を確認
gh pr list

# PR をマージ
gh pr merge 12
```

### PR のタイトル・説明の書き方

```markdown
## Summary
- 実装した機能・修正内容を箇条書きで記載

## 変更ファイル
- `server/server.js` - 通知設定 API を追加
- `terraform/main.tf` - EventBridge IAM ポリシーを追加

## Test plan
- [ ] 通知時刻を設定できること
- [ ] LINE に波情報が送信されること
```

---

## 6. このプロジェクトの開発フロー

### ブランチ戦略

```
main                    本番リリース済みのコード
  └─ feature/xxx        新機能開発
  └─ fix/xxx            バグ修正
  └─ docs/xxx           ドキュメント更新
```

### 実際の開発手順

```bash
# 1. main を最新状態にする
git checkout main
git pull origin main

# 2. 作業ブランチを作成
git checkout -b feature/wave-notification

# 3. コードを編集・実装

# 4. 変更を確認
git status
git diff

# 5. ステージング・コミット
git add server/server.js terraform/main.tf
git commit -m "feat: LINE通知機能を追加"

# 6. GitHub に push
git push -u origin feature/wave-notification

# 7. PR を作成（GitHub 画面 or gh コマンド）
gh pr create --title "feat: LINE通知機能の追加" --body "..."

# 8. PR をマージ後、main に戻る
git checkout main
git pull origin main

# 9. マージ済みのブランチを削除
git branch -d feature/wave-notification
```

### このプロジェクトの実際のコミット履歴

```
abfe977 docs: DynamoDB型変換・データ表示フロー・React keyの解説を追記
fc07dba docs: Lambda・serverless-httpのリクエスト変換フローを詳細追記
cdace4a docs: AWSサービス解説ガイドを追加
e68a601 docs: LINE通知機能のREADME・アーキテクチャ図を更新
ba8d99b feat: LINE通知機能・スポットごと通知設定・レスポンシブ対応
5a69de9 docs: コンセプトセクションを追加（低コスト運営・キャッシュ設計）
9538052 docs: 風向き・風速表示機能をREADMEに追加
abcf3f3 fix: StormglassAPIのリクエストにwindSpeedを追加
```

---

## 7. よくあるトラブルと対処法

### push が拒否された

```bash
# エラー例
! [rejected] main -> main (fetch first)

# 原因: リモートに自分のローカルにない変更がある
# 対処: pull してからpush
git pull origin main
git push origin main
```

### コンフリクト（競合）が発生した

同じファイルの同じ箇所を別々に変更するとコンフリクトが発生します。

```
<<<<<<< HEAD
自分の変更内容
=======
リモートの変更内容
>>>>>>> origin/main
```

1. ファイルを開いて `<<<<<<<`・`=======`・`>>>>>>>` を手動で修正
2. 正しい状態にしたら `git add` してコミット

```bash
git add 競合したファイル
git commit -m "fix: コンフリクトを解消"
```

### 直前のコミットを修正したい

```bash
# コミットメッセージだけ修正
git commit --amend -m "feat: 修正後のメッセージ"

# ファイルも含めて修正（ファイルを add してから）
git add 追加ファイル
git commit --amend
```

> `--amend` は push 済みのコミットには使わないこと。履歴が書き換わり、他の人に影響が出る。

### 変更を元に戻したい

```bash
# ステージングを取り消す（ファイルの変更は残る）
git restore --staged server/server.js

# ファイルの変更を取り消す（編集内容が消える・注意）
git restore server/server.js

# 特定のコミットまで戻す（履歴は残る）
git revert コミットハッシュ
```

### .gitignore に追加したのに Git が追跡している

一度 Git に追跡されたファイルは `.gitignore` に追加しても無視されません。

```bash
# キャッシュから削除（ファイル自体は残る）
git rm --cached .env
git commit -m "chore: .envをgit管理から除外"
```
