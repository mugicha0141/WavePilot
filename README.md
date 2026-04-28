## 1.アプリケーション概要
# Wave App
React、Open-Meteo API、Leafletを使用して作成した波情報ダッシュボードです。

## 2.システム仕様
### 技術スタック
| カテゴリ | 使用技術 |
| :--- | :--- |
| **Frontend** | React |
| **Backend** | Node.js, Express |
| **Database** | PostgreSQL (Docker) |
| **Infrastructure** | Docker, Docker Compose |

### 主要機能
1.  **ユーザー認証機能**: データベース（`user_login` テーブル）と連携したログインシステム。
2.  **波情報表示**: 地図で指定した座標情報をもとに外部APIから取得した波高データのグラフ表示。

## 3.セットアップ手順
リポジトリを `git pull`した後、以下の手順で環境を構築してください。
### ① 依存関係のインストール
プロジェクトルートで以下のコマンドを実行し、全ディレクトリのライブラリを一括で導入します。
```bash
npm run install-all
```
### ② 環境変数 (.env) の作成
セキュリティ保護のため Git に含まれていない設定ファイルを作成します。
server/ ディレクトリ直下に .env ファイルを作成し、以下を記述してください。

ファイルパス: server/.env
```bash
DB_USER=user
DB_HOST=localhost
DB_NAME=wave_db
DB_PASSWORD=password
DB_PORT=5432
PORT=8080
```

### ③ データベースの起動
Docker Compose を使用して、PostgreSQL コンテナをバックグラウンドで起動します。
```bash
docker-compose up -d
```
起動時に init.sql が実行され、テスト用ユーザーが自動作成されます。

### ④ アプリケーションの起動
```bash
npm start
```
Frontend: http://localhost:3000  
Backend: http://localhost:8080

## 4.データベース構造 (DB Schema)
ログイン機能に使用しているテーブル構造は以下の通りです。
### テーブル: `user_login`
ユーザーの認証情報を格納します。

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | 自動採番されるユーザー固有ID |
| `user_name` | TEXT | UNIQUE, NOT NULL | ログインに使用するユーザー名 |
| `user_password` | TEXT | NOT NULL | パスワード（現在は開発用として平文保存）

## 5. 開発者向けメモ (Developer Notes)
### テスト用アカウント
環境構築後、以下の情報ですぐにログイン動作を確認できます。
- **ユーザー名:** `test`
- **パスワード:** `password123`

### 便利な運用コマンド
開発中に頻繁に使用するコマンド集です。
* **コンテナの状態確認**
    ```bash
    docker-compose ps
    ```
* **DBの中身を直接確認 (psql)**
    ```bash
    docker exec -it wave_postgres psql -U user -d wave_db
    ```
* **サーバー停止(Ctrl + C）**
* **クリーンアップ**
    ```bash
    docker-compose down -v
    ```
