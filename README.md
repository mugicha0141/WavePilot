# Wave App

React + Node.js + PostgreSQL で構築したサーファー向け波情報ダッシュボードです。
地図上でポイントを選択するだけで、最大7日分の波高予報をグラフで確認できます。

---

## 目次

1. [アプリ概要](#1-アプリ概要)
2. [システム仕様](#2-システム仕様)
3. [セットアップ手順](#3-セットアップ手順)
4. [開発者メモ](#4-開発者メモ)

---

## 1. アプリ概要

### 主な機能

| 機能 | 説明 |
| :--- | :--- |
| **ユーザー認証** | ログイン・ログアウト（PostgreSQL 連携） |
| **波情報マップ** | Leaflet 地図上をクリックして座標を指定し、波高グラフを表示 |
| **波高グラフ** | Stormglass API から取得した 3 時間刻みの波高データを Chart.js で描画（1/2/3/7 日間の切替） |
| **お気に入り登録** | よく行くポイントを名前・座標付きで DB に保存 |
| **キャッシュ機能** | お気に入りの波データを DB（JSONB）にキャッシュし、次回以降の読込を高速化 |

### 画面遷移

```
/           ログイン画面
 └─ /home        ホーム（メニュー）
     ├─ /WaveMap              地図 + 波高グラフ
     └─ /FavoritePlaceList    お気に入り一覧
          └─ /FavoritePlaceWaveChart   お気に入り地点の波高グラフ
```

---

## 2. システム仕様

### 技術スタック

| カテゴリ | 使用技術 |
| :--- | :--- |
| **Frontend** | React 18、React Router v7、Leaflet / react-leaflet、Chart.js、Axios |
| **Backend** | Node.js、Express 4 |
| **Database** | PostgreSQL 15（Docker コンテナ） |
| **外部 API** | [Stormglass API](https://stormglass.io/) （波高・周期・風向データ） |
| **Infrastructure** | Docker、Docker Compose |

### バックエンド API エンドポイント

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| `POST` | `/server` | ログイン認証。`user_name` + `user_password` を受け取り、ユーザー情報を返す |
| `GET` | `/api/wave-data?lat=&lng=` | 座標を受け取り Stormglass API へリクエストして波高データを返す |
| `POST` | `/api/favorites` | お気に入りポイントを登録する |
| `GET` | `/api/favorites/:userId` | 指定ユーザーのお気に入り一覧を返す |
| `PUT` | `/api/favorites/cache` | 指定お気に入りの波データキャッシュを更新する |

### データフロー

```
ユーザーが地図をクリック
  → 座標を取得
  → Frontend: FetchWaveData.js が GET /api/wave-data へリクエスト
  → Backend: Stormglass API へリクエスト
  → 波高データを Chart.js グラフとして表示
  → お気に入り保存 → POST /api/favorites → DB に保存
  → 次回お気に入り表示時: DB キャッシュから即時ロード（PUT /api/favorites/cache で更新）
```

### DB スキーマ

#### テーブル: `user_login`

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | 自動採番ユーザー ID |
| `user_name` | TEXT | UNIQUE, NOT NULL | ログイン用ユーザー名 |
| `user_password` | TEXT | NOT NULL | パスワード（現在は平文・開発用） |

#### テーブル: `favorite_places`

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | 自動採番 ID |
| `user_id` | INTEGER | NOT NULL, FK → `user_login.id` | 所有ユーザー |
| `point_name` | TEXT | NOT NULL | ポイント名（鵠沼、辻堂など） |
| `latitude` | DOUBLE PRECISION | NOT NULL | 緯度 |
| `longitude` | DOUBLE PRECISION | NOT NULL | 経度 |
| `wave_cache` | JSONB | | キャッシュされた波データ（生 JSON） |
| `updated_at` | TIMESTAMP | | キャッシュ最終更新日時 |

- `user_login.id` に CASCADE DELETE 設定済み（ユーザー削除でお気に入りも自動削除）

---

## 3. セットアップ手順

### 前提条件

- Node.js 18+
- Docker / Docker Compose
- Stormglass API キー（[stormglass.io](https://stormglass.io/) で無料取得可）

### ① 依存関係のインストール

プロジェクトルートで以下を実行するとクライアント・サーバー双方の依存関係を一括インストールします。

```bash
npm run install-all
```

### ② 環境変数ファイルの作成

`server/.env` を新規作成し、以下を記述してください。

```env
DB_USER=user
DB_HOST=localhost
DB_NAME=wave_db
DB_PASSWORD=password
DB_PORT=5432
PORT=8080
STORMGLASS_API_KEY=<取得した API キー>
```

### ③ データベースの起動

Docker Compose で PostgreSQL コンテナをバックグラウンド起動します。
初回起動時に `init.sql` が自動実行され、テーブルとテストユーザーが作成されます。

```bash
docker-compose up -d
```

### ④ アプリケーションの起動

```bash
npm start
```

| サービス | URL |
| :--- | :--- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8080 |

---

## 4. 開発者メモ

### テスト用アカウント

`init.sql` により環境構築直後から以下のアカウントでログインできます。

- **ユーザー名:** `test`
- **パスワード:** `password123`

### よく使うコマンド

```bash
# コンテナ状態確認
docker-compose ps

# psql で DB に直接接続
docker exec -it wave_postgres psql -U user -d wave_db

# アプリ停止
Ctrl + C

# コンテナ停止・削除
docker-compose down
```

### セキュリティ上の注意

- パスワードは現在 **平文保存** です。本番運用前に bcrypt 等でハッシュ化してください。
- Stormglass API キーは `.env` に記載し、**絶対に Git にコミットしないでください**（`.gitignore` 設定済み）。
