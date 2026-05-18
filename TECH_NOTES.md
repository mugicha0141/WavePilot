# WavePilot 技術解説ドキュメント

サーフィン波情報アプリ（WavePilot）で使われている技術をまとめたドキュメントです。

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [フロントエンド（React）](#2-フロントエンドreact)
3. [バックエンド（Node.js / Express）](#3-バックエンドnodejs--express)
4. [データベース（DynamoDB）](#4-データベースdynamodb)
5. [認証（Amazon Cognito）](#5-認証amazon-cognito)
6. [API通信](#6-api通信)
7. [状態管理](#7-状態管理)
8. [データキャッシュ](#8-データキャッシュ)
9. [グラフ描画（Chart.js）](#9-グラフ描画chartjs)
10. [地図表示（React Leaflet）](#10-地図表示react-leaflet)
11. [インフラ・デプロイ](#11-インフラデプロイ)

---

## 1. アーキテクチャ概要

### 本番環境（AWS）

```
【配信】
ブラウザ ← CloudFront ← S3（React ビルド成果物）

【認証】
ブラウザ ⇄ Amazon Cognito User Pool
            （IDトークン発行・検証）

【API通信】
ブラウザ → API Gateway HTTP API
            ↓ JWT Authorizer（Cognitoで検証）
          Lambda（Express + serverless-http）
            ├─ DynamoDB（お気に入り・ユーザーデータ）
            └─ Stormglass API（波情報）

【シークレット管理】
Lambda ← SSM Parameter Store（APIキー）
```

### ローカル環境（LocalStack）

```
ブラウザ ← S3 Website（LocalStack）

ブラウザ → API Gateway（LocalStack・認証なし）
         → Lambda（LocalStack）
           ├─ DynamoDB（LocalStack）
           └─ Stormglass API（本物）

認証: カスタム JWT（server.js 内で発行・検証）
```

| レイヤー | 技術 | 役割 |
|---------|------|------|
| フロントエンド | React 18 | UI描画・状態管理 |
| 認証（本番） | Amazon Cognito + AWS Amplify v6 | ユーザー管理・JWT発行 |
| 認証（ローカル） | カスタム JWT | 開発環境用の簡易認証 |
| バックエンド | Node.js + Express | APIサーバー |
| データベース | AWS DynamoDB | ユーザー・お気に入り保存 |
| 外部API | Stormglass | 波情報取得 |
| CDN | Amazon CloudFront | HTTPS配信・キャッシュ |
| インフラ管理 | Terraform + LocalStack | AWS構成のコード管理・ローカル再現 |

---

## 2. フロントエンド（React）

### React とは

コンポーネント（部品）を組み合わせてUIを作るJavaScriptライブラリ。
「状態が変わったら自動的に画面を更新する」のが核心。

### 関数コンポーネントと Hooks

このアプリはすべて**関数コンポーネント**で書かれています。  
**Hooks** という関数で状態・副作用を扱います。

#### useState — 状態の保持

```js
// Login.js
const [formValues, setFormValues] = useState({ user_name: "", user_password: "" });

// 値を変えるには必ず setter を使う（直接代入はNG）
setFormValues({ ...formValues, user_name: "tanaka" });
```

- `formValues` : 現在の値（読み取り専用）
- `setFormValues` : 値を更新する関数（呼ぶと画面が再描画される）

#### useEffect — 副作用の実行

「レンダリング後に何かしたい」ときに使う。API呼び出しやDOM操作が典型例。

```js
// WaveChart.js — location が変わるたびに波データを取得
useEffect(() => {
  if (!location || location.lat === 0) return;

  const GetWaveData = async () => {
    const res = await FetchWaveData(location.lat, location.lng);
    setRawWaveData(res.data.hours);
  };

  GetWaveData();
}, [location]); // ← 第2引数の配列が「依存関係」
```

**依存関係配列のルール:**

| 書き方 | 実行タイミング |
|--------|--------------|
| `useEffect(() => {}, [])` | マウント時（初回）のみ |
| `useEffect(() => {}, [x])` | `x` が変わるたび |
| `useEffect(() => {})` | 毎回のレンダリング後 |

#### useRef — DOMやインスタンスへの参照

再レンダリングをまたいで値を保持したい、またはDOM要素に直接アクセスしたいときに使う。

```js
// WaveChart.js — Chart.js インスタンスを保持
const chartRef = useRef(null);       // <canvas> 要素への参照
const chartInstance = useRef(null);  // Chart.js インスタンスへの参照

// useRef の値を変えても再レンダリングが起きない（useState との違い）
chartInstance.current = new Chart(ctx, { ... });
```

### React Router v7

URL によって表示するコンポーネントを切り替える仕組み。

```js
// App.js
<Routes>
  <Route path="/" element={<Login ... />} />
  <Route path="/home" element={<Home ... />} />
  <Route path="/WaveMap" element={<WaveMap ... />} />
</Routes>
```

---

## 3. バックエンド（Node.js / Express）

### Express とは

Node.js 上でHTTPサーバーを簡単に作れるフレームワーク。  
「このURLに来たらこの処理をする」という**ルーティング**が核心。

```js
app.get("/api/wave-data", async (req, res) => {
  const { lat, lng } = req.query;
  // ... 処理 ...
  res.json({ data: result });
});
```

### AWS Lambda 対応

**Lambda とは「呼ばれた時だけ起動するサーバー」** です。  
通常のサーバーは24時間起動したままですが、Lambda はリクエストが来た瞬間だけ起動し、処理が終わると停止します。起動していない間はコストがかかりません。

`serverless-http` を使うと、Express アプリをそのまま Lambda 関数として動かせます。

```js
const serverless = require("serverless-http");
module.exports.handler = serverless(app); // Lambda のエントリーポイント
```

---

## 4. データベース（DynamoDB）

### DynamoDB とは

**「Excelの表」ではなく「付箋の束」** のようなデータベースです。

通常のSQL（リレーショナル）データベースは列（カラム）が固定で、全行が同じ構造を持ちます。  
DynamoDB は NoSQL なので、行ごとに違うフィールドを持てます。AWSが管理するため、サーバーの運用が不要でデータ量に応じて自動でスケールします。

検索は「パーティションキー」という主キーで行います。別の列で検索したい場合は **グローバルセカンダリインデックス（GSI）** を使います。

### テーブル構成

**user_login テーブル**（ローカル開発専用）

| フィールド | 型 | 説明 |
|-----------|---|------|
| id | Number | パーティションキー |
| user_name | String | ユーザー名 |
| user_password | String | パスワード（平文・開発用） |

**favorite_places テーブル**

| フィールド | 型 | 説明 |
|-----------|---|------|
| id | String | パーティションキー |
| user_id | String | Cognito の sub（GSI: `user_id-index`） |
| latitude | Number | 緯度 |
| longitude | Number | 経度 |
| point_name | String | ポイント名 |
| wave_cache | Map | 波予報データのキャッシュ |
| updated_at | String | 最終更新日時 |

---

## 5. 認証（Amazon Cognito）

### まず「認証」の課題を理解する

ログイン後にAPIを叩くとき、「このリクエストは本当にログイン済みのユーザーから来たのか」をサーバーが確認する必要があります。  
HTTPは「毎回リクエストを独立して送る」仕組みなので、前のリクエストで誰かがログインしたかをサーバーは覚えていません。

### JWTとは（本人確認スタンプ）

**JWT（JSON Web Token）** は、ログイン成功時にサーバーが発行する「デジタルの会員証」です。

```
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNjk...
     ↑ヘッダー（形式）        ↑ペイロード（ユーザー情報）    ↑署名
```

3つのパートが `.` で繋がっています：
- **ヘッダー**: 署名アルゴリズムの種類
- **ペイロード**: ユーザーIDや有効期限など（Base64でエンコード、誰でも読める）
- **署名**: 秘密鍵で作られたハッシュ値（これがあるので偽造できない）

> **ポイント**: サーバーは署名を検証するだけでユーザーを確認できます。DBを毎回見に行く必要がありません。

ブラウザはこのJWTを保存しておき、以降のAPIリクエスト時に `Authorization: Bearer <JWT>` というヘッダーに付けて送ります。

### Amazon Cognito とは（AWSの認証サービス）

**Cognito は「ユーザー管理を丸ごとAWSに外注できるサービス」** です。

自前でユーザー認証を実装すると：
- パスワードのハッシュ化・保存
- トークンの発行・検証ロジック
- セキュリティ対策（ブルートフォース対策等）

…を全部自分で作る必要があります。Cognito を使うと、これらをすべてAWSが代わりに管理してくれます。

### 本番環境の認証フロー

```
① ブラウザ: ログインフォームに入力
     ↓
② AWS Amplify: Cognito に認証リクエスト送信
     ↓
③ Cognito: パスワード検証 → IDトークン（JWT）を発行
     ↓
④ Amplify: IDトークンを localStorage に保存
     ↓
⑤ API呼び出し時: Amplify が IDトークンを取得し
   "Authorization: Bearer <IDトークン>" をヘッダーに付与
     ↓
⑥ API Gateway の JWT Authorizer:
   Cognito の公開鍵でトークンの署名を自動検証
   → 無効なら 401 を返してLambdaには届かない
     ↓
⑦ Lambda（バックエンド）: 検証済みリクエストを処理
```

### AWS Amplify とは

**Amplify は Cognito を React から簡単に使うためのライブラリ** です。  
`signIn()` を呼ぶだけでCognitoへの通信・トークン保存・更新を全部やってくれます。

```js
// auth.js — Cognito ログイン
export const cognitoLogin = async (username, password) => {
  // 前回のセッションが残っていたら先にクリア
  try { await signOut(); } catch (_) {}

  // Cognito に認証リクエスト
  await signIn({ username, password, options: { authFlowType: "USER_PASSWORD_AUTH" } });

  // 成功したらトークンからユーザー情報を取り出す
  const session = await fetchAuthSession();
  const claims = session.tokens?.idToken?.payload;
  return { id: claims?.sub, user_name: claims?.["cognito:username"] };
};
```

### API Gateway の JWT Authorizer とは（入口のゲート）

**API Gateway は「API のフロントに立つ受付」** で、JWT Authorizer は **「入館証チェック係」** です。

```
ブラウザ → [JWT Authorizer] → Lambda
              ↑
    トークンが有効でないと
    ここで 401 を返してLambdaには届かない
```

Lambda 側でトークン検証のコードを書く必要がなく、API Gateway が自動でCognitoに確認します。

### ローカル開発の認証フロー（カスタム JWT）

LocalStack は Cognito に対応していないため、ローカルでは独自のJWT認証を使います。

```
① ブラウザ: POST /login でユーザー名・パスワードを送信
     ↓
② server.js: DynamoDB の user_login テーブルでユーザーを検索・照合
     ↓
③ 一致したら jsonwebtoken でトークン生成（有効期限24時間）
     ↓
④ ブラウザ: トークンを localStorage に保存
     ↓
⑤ API呼び出し時: localStorage からトークンを取得し Authorization ヘッダーに付与
     ↓
⑥ server.js の JWT ミドルウェアがトークンを検証
```

### 環境切り替えの仕組み

`client/src/auth.js` の `isCognito` フラグで本番/ローカルを切り替えています。

```js
// ビルド時の環境変数で切り替わる
export const isCognito = process.env.REACT_APP_AUTH_MODE === "cognito";

export const getToken = async () => {
  if (isCognito) {
    // 本番: Amplify から Cognito の IDトークンを取得
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  }
  // ローカル: localStorage からカスタムJWTを取得
  return localStorage.getItem("token");
};
```

本番ビルド時に `REACT_APP_AUTH_MODE=cognito` を渡すことで、コードを変えずに切り替わります。

### Cognito vs カスタム JWT の比較

| 項目 | Cognito（本番） | カスタム JWT（ローカル） |
|------|---------------|----------------------|
| ユーザー管理 | Cognito User Pool | DynamoDB の user_login テーブル |
| トークン検証 | API Gateway が自動処理 | server.js のミドルウェア |
| セキュリティ | AWSが管理（ブルートフォース対策等） | 開発用・シンプル |
| トークン有効期限 | 1時間（自動更新） | 24時間 |
| LocalStack | 非対応 | 対応 |

---

## 6. API通信

### authFetch（認証付きリクエストの共通処理）

認証が必要なAPIリクエストはすべて `authFetch` を経由します。  
内部で `getToken()` を呼び、環境に応じたトークンを自動でヘッダーに付与します。

```js
// utils/authFetch.js
const authFetch = async (url, options = {}) => {
  const token = await getToken(); // Cognito IDトークン or カスタムJWT
  const { headers = {}, ...rest } = options;
  return fetch(url, {
    ...rest,
    headers: { ...headers, Authorization: `Bearer ${token}` },
  });
};
```

### サーバーから外部API（Stormglass）へ

```js
// server.js
const response = await axios.get("https://api.stormglass.io/v2/weather/point", {
  params: { lat, lng, params: "waveHeight,wavePeriod,windDirection" },
  headers: { Authorization: process.env.STORMGLASS_API_KEY },
});
```

**APIキーをサーバー側で持つ理由**: ブラウザから直接Stormglassを叩くと、APIキーがDevToolsのネットワークタブに丸見えになります。サーバーを経由させることでキーを隠します。

---

## 7. 状態管理

このアプリは Redux などの外部ライブラリを使わず、React の `useState` だけで状態管理しています。

### 状態の分類

| コンポーネント | 状態 | 説明 |
|--------------|------|------|
| App.js | `currentUser` | 認証済みユーザー情報（アプリ全体） |
| WaveChart.js | `chartData`, `rawWaveData`, `days`, `loading`, `rateLimit` | グラフ・データ・API残数 |
| FavoritePlaceList.js | `favorites`, `isEditModalOpen` | リスト・モーダル |
| Login.js | `formValues`, `formErrors` | フォーム |

---

## 8. データキャッシュ

Stormglass の無料枠は **10回/日** のみです。  
リクエスト回数を節約するため、取得したデータを3段階でキャッシュしています。

```
Stormglass API（10回/日の制限）
    ↓ 1回取得したら
useState（メモリ）← 同セッション内で地図クリックのたびにAPIを叩かない
    ↓ お気に入り保存時
DynamoDB（wave_cache）← 次回ログイン後もキャッシュを使える
```

残りリクエスト数はグラフ下部に表示されます（レスポンスの `meta.requestCount` / `meta.dailyQuota` から取得）。

---

## 9. グラフ描画（Chart.js）

Canvas要素にグラフを描画するライブラリ。Reactに特化したものではないため、`useRef` でCanvas要素を直接操作します。

```js
const chartRef = useRef(null);      // <canvas ref={chartRef} />
const chartInstance = useRef(null); // Chart インスタンスを保持

useEffect(() => {
  if (!chartData || !chartRef.current) return;
  const ctx = chartRef.current.getContext("2d");

  // 既存グラフを破棄してから描画（二重描画バグを防ぐ）
  if (chartInstance.current) chartInstance.current.destroy();

  chartInstance.current = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { beginAtZero: true },
      },
    },
  });

  return () => chartInstance.current?.destroy(); // コンポーネント破棄時にクリーンアップ
}, [chartData]);
```

---

## 10. 地図表示（React Leaflet）

地図ライブラリ「Leaflet」の React ラッパー。地図・マーカー・クリックイベントをコンポーネントとして扱えます。

```jsx
<MapContainer center={[35.306, 139.485]} zoom={10}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <Marker position={[35.306, 139.485]}>
    <Popup>クリックした地点</Popup>
  </Marker>
</MapContainer>
```

地図タイル（背景画像）は **OpenStreetMap** を使用しています（無料・オープンソース）。

---

## 11. インフラ・デプロイ

### Terraform とは（インフラのコード管理）

**「AWSの設定をコードで書いて管理する仕組み」** です。

AWSコンソールで手動操作すると、「何をどう作ったか」が残りません。  
Terraform を使うと `main.tf` というファイルに「S3バケットを1つ、DynamoDBテーブルを2つ作って」と書けば、`terraform apply` 一発でAWSに反映されます。チームで共有・再現できるのが利点です。

```
terraform/
  ├── main.tf        # リソース定義（何を作るか）
  ├── variables.tf   # 変数定義
  └── envs/
      ├── local.tfvars   # ローカル用の変数値
      └── prod.tfvars    # 本番用の変数値
```

### LocalStack とは（ローカルAWS環境）

**「PCの中でAWSを動かすツール」** です。

本番のAWSを使わなくても、DynamoDB・Lambda・S3 などをローカルで動かせます。  
開発中のミスでAWSに課金されるリスクがなく、インターネット不要で開発できます。

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:3.4.0
    ports:
      - "4566:4566"  # DynamoDB も Lambda も S3 もこのポートで動く
```

### CloudFront とは（CDN・配信の高速化）

**「世界中に倉庫を持つ配達業者」** のようなサービスです。

S3 だけで配信すると、東京のS3から海外ユーザーへは遅くなります。  
CloudFront は世界各地のサーバー（エッジロケーション）にファイルをキャッシュし、ユーザーに最も近い場所から配信します。また HTTPS も提供します。

### SSM Parameter Store とは（シークレット管理）

**「AWSの安全な金庫」** です。APIキーなどの機密情報を暗号化して保存し、Lambda が必要な時に取り出します。コードやGitにシークレットを直書きしない設計になっています。

### 本番デプロイ構成

```
S3（React ビルド成果物）
    ↓ CloudFront 経由で HTTPS 配信
ブラウザ
    ↓ Authorization: Bearer <Cognito IDトークン>
API Gateway（JWT Authorizer でトークン検証）
    ↓ 検証OK
Lambda（Node.js 22.x / Express）
    ├─ DynamoDB（お気に入り）
    └─ Stormglass API（波情報）
```

---

## 技術選定のまとめ

| 課題 | 採用技術 | 理由 |
|------|---------|------|
| UIの状態管理 | React useState | 規模が小さいため外部ライブラリ不要 |
| ページ遷移 | React Router v7 | SPA標準のルーティング |
| 認証（本番） | Amazon Cognito + Amplify v6 | トークン管理・検証をAWSに委譲でき、自前実装より安全 |
| 認証（開発） | カスタム JWT | LocalStack が Cognito 非対応のため環境を分ける |
| DBアクセス | AWS SDK v3 | DynamoDB 公式SDK |
| データ永続化 | DynamoDB | サーバーレス・スケーラブル・AWSとの親和性 |
| API呼び出し | Fetch / Axios | Fetch はブラウザ標準、Axios はリトライ・インターセプタ等が充実 |
| グラフ | Chart.js | 軽量・柔軟・ドキュメントが豊富 |
| 地図 | React Leaflet | 無料・OSMと組み合わせ可能 |
| ローカル開発 | LocalStack | AWSと同じ構成をローカルで再現できる |
| CDN | CloudFront | HTTPS・高速配信・SPAのルーティング対応 |
| シークレット管理 | SSM Parameter Store | コードにAPIキーを書かずに済む |
