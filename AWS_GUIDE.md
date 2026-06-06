# WavePilot AWS サービス解説ガイド

このドキュメントは WavePilot で使用している AWS サービスの役割・設定方法・選定理由をまとめたものです。
転職活動などで技術説明を求められた際の参考資料として活用してください。

---

## 目次

1. [全体アーキテクチャ](#1-全体アーキテクチャ)
2. [AWS Lambda](#2-aws-lambda)
3. [Amazon API Gateway](#3-amazon-api-gateway)
4. [Amazon DynamoDB](#4-amazon-dynamodb)
5. [Amazon S3](#5-amazon-s3)
6. [Amazon CloudFront](#6-amazon-cloudfront)
7. [Amazon Cognito](#7-amazon-cognito)
8. [AWS IAM](#8-aws-iam)
9. [AWS Systems Manager Parameter Store](#9-aws-systems-manager-parameter-store)
10. [Amazon EventBridge Scheduler](#10-amazon-eventbridge-scheduler)
11. [Terraform によるインフラ管理](#11-terraform-によるインフラ管理)

---

## 1. 全体アーキテクチャ

```
【フロントエンド配信】
ブラウザ → CloudFront（CDN・HTTPS） → S3（React ビルド成果物）

【認証】
ブラウザ ⇄ Amazon Cognito（ログイン・JWT発行）

【API通信】
ブラウザ → API Gateway（JWT検証） → Lambda（バックエンド）
                                         ├─ DynamoDB（データ保存）
                                         ├─ Stormglass API（波情報取得）
                                         ├─ SSM Parameter Store（APIキー取得）
                                         └─ EventBridge Scheduler（通知スケジュール登録）

【LINE通知（定時実行）】
EventBridge Scheduler → notify Lambda → DynamoDB（LINE ID取得）
                                      → Stormglass API（波情報取得）
                                      → LINE Messaging API（メッセージ送信）
```

### なぜサーバーレス構成にしたか

| 観点 | EC2（サーバー常時起動） | Lambda（サーバーレス） |
| :--- | :--- | :--- |
| コスト | 24時間稼働で固定費発生 | リクエスト数に応じた従量課金 |
| 管理 | OS・ミドルウェアの管理が必要 | インフラ管理不要 |
| スケール | 手動でスケールアップ | 自動でスケール |
| 本アプリ | アクセスが少ない個人アプリには過剰 | アクセスがない時間帯のコストがゼロ |

---

## 2. AWS Lambda

### 役割

サーバーを常時起動せずに、リクエストが来たときだけコードを実行するサービス。
本プロジェクトでは 2 つの Lambda 関数を使用しています。

| 関数名 | ファイル | 役割 |
| :--- | :--- | :--- |
| `wave-app-backend` | `server/server.js` | API リクエスト全般の処理（波情報・お気に入り・通知設定） |
| `wave-notify` | `server/notify.js` | 毎日定時に波情報を LINE へ送信 |

### 仕組み

通常の Node.js サーバーは `app.listen(8080)` で常時起動しますが、Lambda では `serverless-http` というライブラリを使って Express アプリを Lambda 関数としてラップしています。

```javascript
// server.js の末尾
const serverless = require("serverless-http");
module.exports.handler = serverless(app);
```

API Gateway からリクエストが来ると Lambda が起動し、Express のルーティングでリクエストを処理して返します。

### Terraform での設定

```hcl
resource "aws_lambda_function" "wave_app_backend" {
  function_name    = "wave-app-backend"
  role             = aws_iam_role.lambda_role.arn  # 実行権限
  handler          = "server.handler"              # server.js の handler をエントリポイントに
  runtime          = "nodejs22.x"
  filename         = "index.zip"                   # デプロイパッケージ
  source_code_hash = filebase64sha256("index.zip") # コード変更の検知

  environment {
    variables = {
      STORMGLASS_API_KEY = data.aws_ssm_parameter.stormglass_key.value
      # SSM から APIキーを取得して環境変数として渡す
    }
  }
}
```

### 設定のポイント

- **`handler`**: `"server.handler"` は `server.js` ファイルの `module.exports.handler` を指す
- **`runtime`**: 本番は `nodejs22.x`（最新LTS）、ローカルは `nodejs18.x`
- **`source_code_hash`**: ZIP ファイルのハッシュを登録することで、コード変更時のみ Lambda が更新される
- **`timeout`**: notify Lambda は Stormglass API 呼び出しがあるため `30` 秒に設定（デフォルトは 3 秒）

### 他の選択肢との比較

| サービス | 用途 | 本アプリで不採用の理由 |
| :--- | :--- | :--- |
| EC2 | 汎用仮想サーバー | 24時間起動でコストが高い |
| ECS（Fargate） | コンテナ実行 | 個人アプリには設定が複雑すぎる |
| App Runner | コンテナの簡易実行 | Lambda より高コスト |

---

## 3. Amazon API Gateway

### 役割

インターネットからのリクエストを受け付けて Lambda に転送する「玄関口」です。
JWT トークンの検証（認証）もここで行います。

### HTTP API と REST API の違い

AWS には API Gateway の種類が 2 つあります。

| 項目 | HTTP API | REST API |
| :--- | :--- | :--- |
| コスト | 安い（REST APIの約70%オフ） | 高い |
| 機能 | シンプル | 豊富（キャッシュ・変換など） |
| JWT認証 | ネイティブサポート | Lambdaオーソライザーが必要 |
| 本アプリ | ✅ 採用 | 不採用 |

### Terraform での設定

```hcl
# API Gateway 本体
resource "aws_apigatewayv2_api" "wave_app" {
  name          = "wave-app-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
}

# Lambda との統合（プロキシ統合）
resource "aws_apigatewayv2_integration" "wave_app" {
  api_id                 = aws_apigatewayv2_api.wave_app[0].id
  integration_type       = "AWS_PROXY"   # リクエストをそのまま Lambda に渡す
  integration_uri        = aws_lambda_function.wave_app_backend.invoke_arn
  payload_format_version = "2.0"
}

# デフォルトルート（JWT認証あり）
resource "aws_apigatewayv2_route" "wave_app" {
  route_key          = "$default"        # すべてのリクエストにマッチ
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# LINE Webhook ルート（認証なし）
resource "aws_apigatewayv2_route" "webhook" {
  route_key          = "POST /line/webhook"
  authorization_type = "NONE"            # LINE は JWT を持たないため認証除外
}
```

### ルーティングの仕組み

API Gateway はリクエストの `メソッド + パス` でルートを選択します。より具体的なルートが優先されます。

```
POST /line/webhook  →  NONE（認証なし）で Lambda へ
OPTIONS /{proxy+}  →  NONE（CORSプリフライト用）で Lambda へ
その他すべて       →  JWT 検証後に Lambda へ
```

### CORS（Cross-Origin Resource Sharing）とは

ブラウザのセキュリティ制約で、異なるドメイン間のリクエストはデフォルトでブロックされます。
`https://xxx.cloudfront.net`（フロント）から `https://yyy.execute-api.amazonaws.com`（API）へのリクエストは「異なるドメイン」なので、API Gateway 側で許可設定が必要です。

---

## 4. Amazon DynamoDB

### 役割

AWS のフルマネージド NoSQL データベース。テーブルの管理・スケーリング・バックアップを AWS が自動で行います。

### 本プロジェクトのテーブル構成

| テーブル名 | 用途 |
| :--- | :--- |
| `favorite_places` | お気に入りポイント・波データキャッシュ |
| `notification_settings` | LINE通知設定・LINE連携情報 |
| `WaveData` | 波データキャッシュ（地図クリック時） |
| `user_login` | ローカル開発用ユーザー（本番未使用） |

### RDB（MySQL等）との違い

| 項目 | RDB（MySQL） | DynamoDB |
| :--- | :--- | :--- |
| データ構造 | 固定スキーマ（全行が同じカラム） | 柔軟（行ごとに異なる属性を持てる） |
| クエリ | SQL で自由に検索 | パーティションキー or GSI でのみ検索 |
| スケール | 手動でサーバースペック変更 | 自動スケール |
| 管理 | サーバー・チューニングが必要 | フルマネージド |
| 向いているもの | 複雑な集計・JOIN | シンプルな高速読み書き |

### Terraform での設定

```hcl
resource "aws_dynamodb_table" "favorite_places" {
  name         = "favorite_places"
  billing_mode = "PAY_PER_REQUEST"  # リクエスト数に応じた従量課金（無料枠あり）
  hash_key     = "id"               # パーティションキー

  attribute {
    name = "id"
    type = "S"  # String型
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  # GSI（グローバルセカンダリインデックス）
  # user_id でも検索できるように追加インデックスを作成
  global_secondary_index {
    name            = "user_id-index"
    hash_key        = "user_id"
    projection_type = "ALL"  # 全属性を返す
  }
}
```

### GSI（グローバルセカンダリインデックス）とは

DynamoDB は通常パーティションキー（`id`）でしか検索できません。
`user_id` でそのユーザーのお気に入り一覧を取得したい場合、GSI を作成することで別のキーでも高速検索が可能になります。

```javascript
// user_id-index を使ったクエリ（server.js より）
new QueryCommand({
  TableName: "favorite_places",
  IndexName: "user_id-index",       // GSIを指定
  KeyConditionExpression: "user_id = :uid",
  ExpressionAttributeValues: { ":uid": userId },
})
```

### `billing_mode = "PAY_PER_REQUEST"` を選んだ理由

DynamoDB の課金方式は 2 種類あります。

| モード | 特徴 |
| :--- | :--- |
| `PROVISIONED` | 事前にキャパシティを設定。安定したトラフィックに向く |
| `PAY_PER_REQUEST` | アクセス数に応じた従量課金。無料枠あり |

アクセスが不規則な個人アプリでは `PAY_PER_REQUEST` の方がコストを抑えられます。

---

## 5. Amazon S3

### 役割

オブジェクトストレージ（ファイル置き場）。React のビルド成果物（HTML・JS・CSS・画像）を置いて静的ウェブサイトとして公開します。

### 静的ホスティングとは

S3 はファイルを URL でそのまま配信できます。サーバーが不要なため、React のような SPA（シングルページアプリケーション）の配信に適しています。

### Terraform での設定

```hcl
# S3 バケット作成
resource "aws_s3_bucket" "wave_app_static" {
  bucket        = var.s3_bucket_name  # グローバルで一意な名前が必要
  force_destroy = true                # terraform destroy 時にファイルごと削除
}

# 静的ウェブサイト設定
resource "aws_s3_bucket_website_configuration" "wave_app_static" {
  bucket = aws_s3_bucket.wave_app_static.id
  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }  # SPAのルーティング対応
}

# パブリックアクセス許可
resource "aws_s3_bucket_public_access_block" "wave_app_static" {
  block_public_acls   = false
  block_public_policy = false
}

# バケットポリシー（誰でも読み取り可能）
resource "aws_s3_bucket_policy" "wave_app_static" {
  policy = jsonencode({
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.wave_app_static.arn}/*"
    }]
  })
}
```

### `error_document` に `index.html` を指定する理由

React Router を使った SPA では、`/WaveMap` のような URL はサーバー側には存在しません。
ユーザーが直接 URL を入力した場合や、ページをリロードした場合に S3 が 404 を返すと白画面になります。
`error_document = "index.html"` にすることで、存在しないパスへのアクセスも `index.html` を返し、React Router がルーティングを担当します。

---

## 6. Amazon CloudFront

### 役割

CDN（Content Delivery Network）。S3 のコンテンツを世界中のエッジサーバーにキャッシュして、ユーザーの近くから高速配信します。また HTTPS 化も担います。

### S3 直接公開との違い

| 項目 | S3 直接公開 | CloudFront 経由 |
| :--- | :--- | :--- |
| HTTPS | 非対応（HTTP のみ） | 対応 |
| 速度 | S3 のリージョンから配信 | 最寄りのエッジから配信 |
| セキュリティ | S3 を直接公開 | S3 を非公開にできる |
| コスト | 安い | 無料枠あり（月100GB まで） |

### Terraform での設定

```hcl
resource "aws_cloudfront_distribution" "wave_app" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name = aws_s3_bucket_website_configuration.wave_app_static.website_endpoint
    origin_id   = "S3-wave-app-static"

    custom_origin_config {
      http_port              = 80
      origin_protocol_policy = "http-only"  # CloudFront → S3 は HTTP で接続
    }
  }

  default_cache_behavior {
    viewer_protocol_policy = "redirect-to-https"  # HTTP → HTTPS へリダイレクト
    default_ttl            = 3600                 # キャッシュ有効期限（秒）
  }

  # SPA 対応: 403/404 を index.html に返す
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
}
```

### キャッシュ無効化（Cache Invalidation）

React ビルドで JS/CSS のファイル名にはコンテンツハッシュが付くため（`main.abc123.js`）、新しいビルドをデプロイすると自動的に新しいファイルが配信されます。
ただし `index.html` はキャッシュが残ることがあるため、デプロイ後に無効化します。

```bash
# deploy.sh より
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

---

## 7. Amazon Cognito

### 役割

ユーザー認証・管理サービス。ユーザーの登録・ログイン・パスワード管理・JWT トークン発行を担います。

### 本プロジェクトでの使い方

1. ユーザーがログインフォームにID・パスワードを入力
2. フロントエンド（AWS Amplify v6）が Cognito に認証リクエスト
3. Cognito が JWT（ID トークン）を返す
4. フロントエンドが API リクエスト時に JWT を `Authorization` ヘッダーに付与
5. API Gateway が JWT を Cognito に照合して検証

### Terraform での設定

```hcl
# ユーザープール（ユーザーを管理するデータベース）
resource "aws_cognito_user_pool" "main" {
  name = "wavepilot-user-pool"

  password_policy {
    minimum_length    = 8
    require_uppercase = false  # 大文字不要
    require_numbers   = false  # 数字不要（テスト用に緩く設定）
  }
}

# アプリクライアント（フロントエンドからのアクセス設定）
resource "aws_cognito_user_pool_client" "main" {
  name         = "wavepilot-client"
  user_pool_id = aws_cognito_user_pool.main[0].id
  generate_secret = false  # SPA はクライアントシークレット不要

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",    # ID/パスワード認証を許可
    "ALLOW_REFRESH_TOKEN_AUTH",    # リフレッシュトークン更新を許可
  ]

  access_token_validity  = 1   # アクセストークン有効期限（1時間）
  refresh_token_validity = 30  # リフレッシュトークン有効期限（30日）
}

# API Gateway の JWT オーソライザー
resource "aws_apigatewayv2_authorizer" "cognito" {
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]  # JWTをヘッダーから取得

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main[0].id]  # 対象クライアント
    issuer   = "https://cognito-idp.ap-northeast-1.amazonaws.com/${aws_cognito_user_pool.main[0].id}"
  }
}
```

### JWT（JSON Web Token）とは

ログイン成功後に発行される署名付きトークンです。サーバー側でセッションを保持せずに認証状態を確認できます。

```
ヘッダー.ペイロード.署名

ペイロードには user_id（sub）、有効期限（exp）などが含まれる
```

API Gateway は JWT の署名を Cognito の公開鍵で検証し、改ざんされていないことを確認します。

### ローカル開発との違い

| 環境 | 認証方式 |
| :--- | :--- |
| 本番（AWS） | Amazon Cognito が JWT を発行・検証 |
| ローカル | サーバー側でカスタム JWT を発行（`JWT_SECRET` で署名） |

Cognito は AWS サービスのため、ローカルでは代替として独自 JWT を使っています。

---

## 8. AWS IAM

### 役割

AWS リソースへのアクセス権限を管理するサービス。「誰が（Principal）」「何を（Action）」「どのリソースに（Resource）」できるかを定義します。

### 最小権限の原則

IAM の基本は「必要最小限の権限だけを付与する」ことです。
Lambda に `AdministratorAccess`（全権限）を与えることは可能ですが、セキュリティリスクが高まります。

### 本プロジェクトの IAM 構成

```
aws_iam_role.lambda_role（Lambda 実行ロール）
  ├─ AWSLambdaBasicExecutionRole（CloudWatch Logs への書き込み）
  ├─ wave-app-lambda-dynamodb（DynamoDB の特定テーブルへのアクセス）
  └─ wave-app-lambda-scheduler（EventBridge Scheduler の操作）

aws_iam_role.scheduler_role（EventBridge Scheduler 実行ロール）
  └─ wave-app-scheduler-invoke-lambda（notify Lambda の呼び出し）
```

### Terraform での設定

```hcl
# Lambda 実行ロール
resource "aws_iam_role" "lambda_role" {
  name = "wave-app-lambda-role"

  # 信頼ポリシー：Lambda サービスがこのロールを引き受けられる
  assume_role_policy = jsonencode({
    Statement = [{
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# DynamoDB アクセスポリシー（特定テーブルに限定）
resource "aws_iam_policy" "lambda_dynamodb" {
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", ...]
      Resource = [
        "arn:aws:dynamodb:ap-northeast-1:*:table/favorite_places",
        # 必要なテーブルだけを列挙
      ]
    }]
  })
}

# EventBridge Scheduler 操作ポリシー
resource "aws_iam_policy" "lambda_scheduler" {
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", ...]
      Resource = "arn:aws:scheduler:ap-northeast-1:*:schedule/default/wave-notify-*"
      # wave-notify- で始まるスケジュールのみ操作可能
    }, {
      Effect   = "Allow"
      Action   = "iam:PassRole"          # Scheduler にロールを渡す権限
      Resource = aws_iam_role.scheduler_role.arn
    }]
  })
}
```

### `iam:PassRole` とは

Lambda が EventBridge Scheduler にスケジュールを登録する際、「このロールで notify Lambda を呼び出してください」とロールを渡す必要があります。
このロールを渡す操作自体に `iam:PassRole` 権限が必要です。

---

## 9. AWS Systems Manager Parameter Store

### 役割

API キーやシークレットなどの機密情報を安全に保管・管理するサービス。コードやファイルに直接書かずに済みます。

### 本プロジェクトで保管している値

| パラメータ名 | 内容 |
| :--- | :--- |
| `/wave-app/stormglass-api-key` | Stormglass API キー |
| `/wave-app/line-channel-secret` | LINE Channel Secret |
| `/wave-app/line-channel-access-token` | LINE Channel Access Token |
| `/wave-app/jwt-secret` | JWT 署名秘密鍵（ローカル用） |

### なぜ環境変数に直接書かないか

環境変数に直接書いても動作しますが、問題があります：

- `.env` ファイルを誤って Git にコミットするリスク
- Lambda の設定画面で平文で見えてしまう
- 複数の Lambda 関数で同じキーを使う場合に管理が煩雑

SSM Parameter Store に保存すると、Terraform のデプロイ時にのみ取得され、Lambda の環境変数として設定されます。

### 使い方

```bash
# 登録（deploy.sh より）
aws ssm put-parameter \
  --name "/wave-app/stormglass-api-key" \
  --value "$STORMGLASS_API_KEY" \
  --type "SecureString" \   # 暗号化して保存
  --region ap-northeast-1
```

```hcl
# Terraform での参照
data "aws_ssm_parameter" "stormglass_key" {
  name = "/wave-app/stormglass-api-key"
}

resource "aws_lambda_function" "wave_app_backend" {
  environment {
    variables = {
      STORMGLASS_API_KEY = data.aws_ssm_parameter.stormglass_key.value
    }
  }
}
```

---

## 10. Amazon EventBridge Scheduler

### 役割

指定した時刻・スケジュールで AWS サービスを自動実行するサービス。Linux の cron に近い機能を AWS 上で提供します。

### 本プロジェクトでの使い方

ユーザーが通知時刻を設定すると、backend Lambda が EventBridge Scheduler に cron スケジュールを登録します。毎日指定時刻に notify Lambda が自動起動します。

```
ユーザーが「毎日7:00に通知」を設定
  ↓
backend Lambda が EventBridge Scheduler に登録
  cron(0 22 * * ? *)  ← JST 7:00 = UTC 22:00
  Target: notify Lambda
  Input: { user_id, lat, lng, place_name }
  ↓
毎日 UTC 22:00 に notify Lambda が自動実行
```

### cron 式の書き方

```
cron(分 時 日 月 曜日 年)

cron(0 22 * * ? *)
  0   → 0分
  22  → 22時（UTC）= JST 7:00
  *   → 毎日
  *   → 毎月
  ?   → 曜日指定なし
  *   → 毎年
```

### Terraform での設定

```hcl
# Scheduler が notify Lambda を呼び出すためのロール
resource "aws_iam_role" "scheduler_role" {
  assume_role_policy = jsonencode({
    Statement = [{
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }  # Scheduler がロールを使える
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  role = aws_iam_role.scheduler_role.id
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.wave_notify.arn  # notify Lambda のみ呼び出し可能
    }]
  })
}
```

### スケジュールの動的な作成

EventBridge Scheduler のスケジュールは AWS SDK で動的に作成・更新・削除できます。
ユーザーごとに異なる時刻のスケジュールを、コードから管理しています。

```javascript
// server.js より
await schedulerClient.send(new CreateScheduleCommand({
  Name: `wave-notify-${user_id}-${fav_id}`,  // ユーザー・スポットごとに一意な名前
  ScheduleExpression: `cron(${minute} ${utcHour} * * ? *)`,
  Target: {
    Arn: process.env.NOTIFY_LAMBDA_ARN,
    RoleArn: process.env.SCHEDULER_ROLE_ARN,
    Input: JSON.stringify({ user_id, lat, lng, place_name }),  // Lambda に渡す引数
  },
  FlexibleTimeWindow: { Mode: "OFF" },  // 指定時刻ちょうどに実行
}));
```

---

## 11. Terraform によるインフラ管理

### 役割

インフラの構成をコードで管理する IaC（Infrastructure as Code）ツール。AWS コンソールで手動設定する代わりに、コードで定義して自動構築します。

### メリット

| 観点 | 手動（AWSコンソール） | Terraform |
| :--- | :--- | :--- |
| 再現性 | 同じ設定を作り直すのが大変 | `terraform apply` で同じ環境を再構築 |
| 差分管理 | 何が変わったか不明 | Git で変更履歴が残る |
| 複数環境 | ローカル・本番で設定がずれやすい | `var.environment` で切り替え |
| ミス | 手順漏れが起きやすい | 自動化されているのでミスが少ない |

### 環境ごとの切り替え

本プロジェクトでは `var.environment` を使ってローカルと本番の設定を切り替えています。

```hcl
# Cognito は本番のみ作成
resource "aws_cognito_user_pool" "main" {
  count = var.environment == "prod" ? 1 : 0
  ...
}

# Lambda のランタイムを環境で切り替え
runtime = var.environment == "prod" ? "nodejs22.x" : "nodejs18.x"
```

### 主要コマンド

```bash
# インフラ構築・更新（変更差分を適用）
terraform apply -var-file="envs/prod.tfvars"

# 変更プレビュー（実際には変更しない）
terraform plan -var-file="envs/prod.tfvars"

# 現在の状態確認
terraform show

# リソースの削除
terraform destroy -var-file="envs/prod.tfvars"
```

---

## まとめ：各サービスの役割早見表

| サービス | 役割 | 代替案 |
| :--- | :--- | :--- |
| **Lambda** | API処理・通知送信をサーバーレスで実行 | EC2、ECS |
| **API Gateway** | HTTPリクエストの受付・JWT認証・Lambdaへの転送 | ALB + EC2 |
| **DynamoDB** | NoSQL データベース（お気に入り・通知設定） | RDS（MySQL）、Aurora |
| **S3** | React ビルド成果物の静的ホスティング | EC2 + Nginx |
| **CloudFront** | CDN・HTTPS化・高速配信 | — |
| **Cognito** | ユーザー認証・JWT発行 | Firebase Auth、Auth0 |
| **IAM** | AWS リソースへのアクセス権限管理 | —（AWS必須コンポーネント） |
| **SSM Parameter Store** | APIキー・シークレットの安全な管理 | Secrets Manager、環境変数直書き |
| **EventBridge Scheduler** | 毎日定時の通知Lambda実行 | CloudWatch Events、Lambda cron |
| **Terraform** | インフラのコード管理・自動構築 | AWS CDK、CloudFormation |
