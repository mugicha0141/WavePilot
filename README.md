# Wave App

React + Node.js + DynamoDB で構築したサーファー向け波情報ダッシュボードです。
地図上でポイントを選択するだけで、最大7日分の波高予報をグラフで確認できます。

---

## 目次

1. [アプリ概要](#1-アプリ概要)
2. [システム仕様](#2-システム仕様)
3. [ローカル環境構築（LocalStack + Terraform）](#3-ローカル環境構築localstack--terraform)
4. [本番環境（AWS）へのデプロイ](#4-本番環境awsへのデプロイ)
5. [本番環境の停止・削除](#5-本番環境の停止削除)
6. [開発者メモ](#6-開発者メモ)

---

## 1. アプリ概要

### 主な機能

| 機能 | 説明 |
| :--- | :--- |
| **ユーザー認証** | ログイン・ログアウト（DynamoDB 連携） |
| **波情報マップ** | Leaflet 地図上をクリックして座標を指定し、波高グラフを表示 |
| **波高グラフ** | Stormglass API から取得した 3 時間刻みの波高データを Chart.js で描画（1/2/3/7 日間の切替） |
| **お気に入り登録** | よく行くポイントを名前・座標付きで DB に保存 |
| **キャッシュ機能** | お気に入りの波データを DynamoDB にキャッシュし、次回以降の読込を高速化 |

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
| **Backend** | Node.js、Express 4、serverless-http（Lambda 対応） |
| **Database** | AWS DynamoDB |
| **外部 API** | [Stormglass API](https://stormglass.io/)（波高・周期・風向データ） |
| **Infrastructure** | AWS Lambda、API Gateway HTTP API、S3、CloudFront、IAM、SSM Parameter Store |
| **IaC / ローカル** | Terraform、Docker Compose、LocalStack |

### バックエンド API エンドポイント

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| `POST` | `/login` | ログイン認証。`user_name` + `user_password` を受け取り、ユーザー情報を返す |
| `GET` | `/api/wave-data?lat=&lng=` | 座標を受け取り Stormglass API へリクエストして波高データを返す |
| `POST` | `/api/favorites` | お気に入りポイントを登録する |
| `GET` | `/api/favorites/:userId` | 指定ユーザーのお気に入り一覧を返す |
| `PUT` | `/api/favorites/cache` | 指定お気に入りの波データキャッシュを更新する |
| `PATCH` | `/api/favorites/:id` | ポイント名を編集する |
| `DELETE` | `/api/favorites/:id` | お気に入りを削除する |

### データフロー

```
ユーザーが地図をクリック
  → 座標を取得
  → Frontend: FetchWaveData.js が GET /api/wave-data へリクエスト
  → Backend: Stormglass API へリクエスト
  → 波高データを Chart.js グラフとして表示
  → お気に入り保存 → POST /api/favorites → DynamoDB に保存
  → 次回お気に入り表示時: DynamoDB キャッシュから即時ロード
```

### DynamoDB テーブル構成

#### テーブル: `user_login`

| 属性 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | Number | パーティションキー |
| `user_name` | String | ログイン用ユーザー名 |
| `user_password` | String | パスワード（現在は平文・開発用） |

#### テーブル: `favorite_places`

| 属性 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | String | パーティションキー |
| `user_id` | Number | ユーザーID（GSI: `user_id-index` でクエリ可能） |
| `place_name` | String | ポイント名（鵠沼、辻堂など） |
| `latitude` | Number | 緯度 |
| `longitude` | Number | 経度 |
| `wave_cache` | Map | キャッシュされた波データ（生 JSON） |
| `updated_at` | String | キャッシュ最終更新日時（ISO 8601） |

---

## 3. ローカル環境構築（LocalStack + Terraform）

ローカル環境では **LocalStack**（AWS をローカルで再現するツール）と **Terraform**（インフラをコードで管理）を使います。
`deploy.sh` スクリプトがすべての手順を自動化しています。

### 前提条件

- Node.js 18+
- Docker / Docker Compose
- Stormglass API キー（[stormglass.io](https://stormglass.io/) で無料取得可）

### ① 依存関係のインストール

```bash
npm run install-all
```

### ② 環境変数ファイルの作成

`server/.env` を新規作成してください。

```env
PORT=8080
STORMGLASS_API_KEY=<取得した API キー>
AWS_DEFAULT_REGION=ap-northeast-1
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

### ③ LocalStack の起動

Docker Compose で LocalStack（AWS のローカル再現環境）をバックグラウンド起動します。

```bash
docker-compose up -d localstack
```

起動確認：

```bash
docker-compose ps
```

`localstack` が `Up` 状態であれば OK です。

### ④ フルデプロイ

`deploy.sh` を使うと以下をまとめて実行します。

- バックエンドの ZIP ビルド
- Terraform によるインフラ構築（DynamoDB テーブル・Lambda・API Gateway・S3 の作成）
- DynamoDB へのテストユーザー初期データ投入
- React フロントエンドのビルド
- S3 へのデプロイ

```bash
./deploy.sh
```

完了するとアクセス URL が表示されます。

```
アクセス URL: http://wave-app-local-static.s3-website.localhost.localstack.cloud:4566
```

### ⑤ 部分的な再デプロイ

`deploy.sh` はモードオプションで特定の処理だけを再実行できます。

```bash
./deploy.sh --infra       # インフラ（Terraform apply）のみ
./deploy.sh --backend     # Lambda コードの更新のみ
./deploy.sh --frontend    # フロントエンドのビルド + S3 同期のみ
```

### ⑥ 環境の停止・削除

LocalStack はデフォルトでは状態を永続化しません。そのため **停止・再起動のたびに `./deploy.sh` の再実行が必要**です。

```bash
# 一時停止（コンテナを止めるだけ）
docker-compose stop localstack

# 再開
docker-compose start localstack
./deploy.sh

# 完全に削除
docker-compose down
```

---

## 4. 本番環境（AWS）へのデプロイ

### 前提条件

- AWS アカウント
- AWS CLI（`brew install awscli`）
- Terraform（`brew install terraform`）

### ① IAM ユーザーの作成

AWS コンソールで操作します。

1. 「IAM」→「ユーザー」→「ユーザーを作成」
2. ユーザー名を入力（例: `wave-app-deploy`）
3. 「ポリシーを直接アタッチする」→ `AdministratorAccess` を選択
4. 「セキュリティ認証情報」タブ →「アクセスキーを作成」→「CLI」を選択
5. アクセスキーとシークレットキーを保管

### ② AWS CLI の設定

```bash
aws configure
```

| 項目 | 値 |
| :--- | :--- |
| AWS Access Key ID | 発行したアクセスキー |
| AWS Secret Access Key | 発行したシークレットキー |
| Default region | `ap-northeast-1` |
| Default output format | `json` |

### ③ 本番用 API キーファイルの作成

プロジェクトルートに `.env.prod` を作成します（Git 管理対象外）。

```env
STORMGLASS_API_KEY=本番用のAPIキー
```

デプロイ時に自動で SSM Parameter Store へ登録されます。

### ④ S3 バケット名の設定

`terraform/envs/prod.tfvars` の `s3_bucket_name` をグローバルで一意な名前に変更します。

```hcl
s3_bucket_name = "wave-app-yourname-prod"
```

### ⑤ デプロイ実行

```bash
./deploy.sh --env prod
```

以下をまとめて実行します：

- SSM Parameter Store に API キーを登録
- Terraform でインフラ構築（DynamoDB・Lambda・API Gateway・S3・CloudFront・IAM）
- テストユーザーの初期データ投入
- React フロントエンドのビルド・S3 デプロイ

完了するとアクセス URL が表示されます（CloudFront 経由の HTTPS）。

```
アクセス URL: https://xxxxxx.cloudfront.net
```

---

## 5. 本番環境の停止・削除

### AWS リソースの削除

Terraform で作成したリソース（Lambda・API Gateway・DynamoDB・S3・CloudFront・IAM）をすべて削除します。

```bash
terraform -chdir=terraform destroy -var-file="envs/prod.tfvars" -auto-approve
```

### SSM パラメータの削除

API キーは Terraform 管理外のため、別途削除します。

```bash
aws ssm delete-parameter --name "/wave-app/stormglass-api-key" --region ap-northeast-1
```

---

## 6. 開発者メモ

### テスト用アカウント

フルデプロイ後（`./deploy.sh` または手動の初期データ投入後）、以下でログインできます。

| 項目 | 値 |
| :--- | :--- |
| ユーザー名 | `test` |
| パスワード | `password123` |

### セキュリティ上の注意

- パスワードは現在 **平文保存** です。本番運用前に bcrypt 等でハッシュ化してください。
- Stormglass API キーは `.env` / `.env.prod` に記載し、**絶対に Git にコミットしないでください**（`.gitignore` 設定済み）。

### よく使うコマンド

```bash
# LocalStack 起動
docker-compose up -d localstack

# コンテナ状態確認
docker-compose ps

# DynamoDB テーブル一覧確認
docker-compose exec localstack awslocal dynamodb list-tables --region ap-northeast-1

# DynamoDB テーブルの中身を確認
docker-compose exec localstack awslocal dynamodb scan \
  --table-name user_login --region ap-northeast-1

# Terraform の現在の状態確認
docker-compose run --rm terraform show
```

### deploy.sh オプション一覧

```bash
./deploy.sh                        # LocalStack フルデプロイ（デフォルト）
./deploy.sh --env prod             # AWS 本番環境へフルデプロイ
./deploy.sh --infra                # インフラ（Terraform apply）のみ
./deploy.sh --backend              # Lambda コードの更新のみ
./deploy.sh --frontend             # フロントエンドのビルド + S3 同期のみ
./deploy.sh --env prod --frontend  # 本番環境にフロントエンドのみデプロイ
```
