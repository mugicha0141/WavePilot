# WaveApp 技術解説ドキュメント

サーフィン波情報アプリ（WaveApp）で使われている技術をまとめたドキュメントです。

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [フロントエンド（React）](#2-フロントエンドreact)
3. [バックエンド（Node.js / Express）](#3-バックエンドnodejs--express)
4. [データベース（DynamoDB）](#4-データベースdynamodb)
5. [認証](#5-認証)
6. [API通信](#6-api通信)
7. [状態管理](#7-状態管理)
8. [データキャッシュ](#8-データキャッシュ)
9. [グラフ描画（Chart.js）](#9-グラフ描画chartjs)
10. [地図表示（React Leaflet）](#10-地図表示react-leaflet)
11. [インフラ・デプロイ](#11-インフラデプロイ)

---

## 1. アーキテクチャ概要

```
ブラウザ (React SPA)
    ↕ HTTP (Fetch / Axios)
Express サーバー (Node.js)
    ↕ AWS SDK v3
DynamoDB (NoSQL)
    ↕ Axios
Stormglass API (外部・波情報)
```

| レイヤー | 技術 | 役割 |
|---------|------|------|
| フロントエンド | React 18 | UI描画・状態管理 |
| ルーティング | React Router v7 | SPA内ページ遷移 |
| HTTP通信 | Fetch API / Axios | サーバーとのやりとり |
| バックエンド | Node.js + Express | APIサーバー |
| データベース | AWS DynamoDB | ユーザー・お気に入り保存 |
| 外部API | Stormglass | 波情報取得 |
| インフラ | LocalStack + Terraform | AWS環境のローカル再現 |

---

## 2. フロントエンド（React）

### React とは

コンポーネント（部品）を組み合わせてUIを作るJavaScriptライブラリ。
「状態が変わったら自動的に画面を更新する」のが核心。

### 関数コンポーネントと Hooks

このアプリはすべて**関数コンポーネント**で書かれています。  
昔のクラスコンポーネントの代わりに、**Hooks** という関数で状態・副作用を扱います。

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

#### useNavigate / useLocation — ルーティング系

```js
// ページ遷移
const navigate = useNavigate();
navigate("/home");

// 現在のURL情報を取得
const location = useLocation();
console.log(location.pathname); // "/home"
```

### React Router v7

URL によって表示するコンポーネントを切り替える仕組み。

```js
// App.js
<Routes>
  <Route path="/" element={<Login ... />} />
  <Route path="/home" element={<Home ... />} />
  <Route path="/WaveMap" element={<WaveMap ... />} />
  <Route path="/user/:userId/FavoritePlaceList" element={<FavoritePlaceList ... />} />
  <Route path="/user/:userId/FavoritePlaceList/:placeId/" element={<FavoritePlaceWaveChart ... />} />
</Routes>
```

- `:userId` や `:placeId` は**URLパラメータ**。`useParams()` で取り出せる

### コンポーネント間のデータ渡し（Props）

親→子へデータを渡す唯一の正規ルート。

```js
// App.js（親）
<FavoritePlaceList currentUser={currentUser} />

// FavoritePlaceList.js（子）
function FavoritePlaceList({ currentUser }) {
  // currentUser を使える
}
```

---

## 3. バックエンド（Node.js / Express）

### Express とは

Node.js 上でHTTPサーバーを簡単に作れるフレームワーク。  
「このURLに来たらこの処理をする」という**ルーティング**が核心。

### 基本構造

```js
// server.js
const express = require("express");
const app = express();

// ミドルウェア（全リクエストに適用する処理）
app.use(cors());            // 異なるオリジンからのリクエストを許可
app.use(bodyParser.json()); // リクエストボディをJSONとして解析

// ルーティング
app.get("/api/wave-data", async (req, res) => {
  const { lat, lng } = req.query; // クエリパラメータ
  // ... 処理 ...
  res.json({ data: result });     // JSONで返す
});

app.listen(8080);
```

### ミドルウェアとは

リクエストが届いてからレスポンスを返すまでの「中間処理」。  
`app.use()` で登録した順番に実行される。

```
リクエスト → cors() → bodyParser.json() → ルートハンドラ → レスポンス
```

### 非同期処理（async / await）

Node.js はシングルスレッドなので、DBやAPIの待機中に他の処理を進める**非同期処理**が基本。

```js
app.post("/login", async (req, res) => {
  try {
    const { user_name, user_password } = req.body;

    // await で DynamoDB の応答を待つ（その間、他のリクエストも処理できる）
    const { Items } = await docClient.send(new ScanCommand({ ... }));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### AWS Lambda 対応

`serverless-http` を使って Express アプリをそのまま Lambda ハンドラーにできる。

```js
const serverless = require("serverless-http");
module.exports.handler = serverless(app); // Lambda のエントリーポイント
```

---

## 4. データベース（DynamoDB）

### DynamoDB とは

AWSが提供するNoSQL（非リレーショナル）データベース。  
SQLではなく、パーティションキーでレコードを検索する。

### テーブル構成

**user_login テーブル**
| フィールド | 型 | 説明 |
|-----------|---|------|
| id | Number | パーティションキー |
| user_name | String | ユーザー名 |
| user_password | String | パスワード（平文・要改善） |

**favorite_places テーブル**
| フィールド | 型 | 説明 |
|-----------|---|------|
| id | Number | パーティションキー |
| user_id | Number | ユーザーID（GSI） |
| latitude | Number | 緯度 |
| longitude | Number | 経度 |
| place_name | String | ポイント名 |
| wave_cache | Map | 波予報データのキャッシュ |
| updated_at | String | 最終更新日時 |

`user_id-index` というグローバルセカンダリインデックス（GSI）を使って、ユーザーIDでの検索を高速化している。

### AWS SDK v3 の使い方

```js
// クライアント初期化
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-northeast-1" });
const docClient = DynamoDBDocumentClient.from(client); // より扱いやすいラッパー

// クエリ（GSIで user_id を検索）
const { Items } = await docClient.send(new QueryCommand({
  TableName: "favorite_places",
  IndexName: "user_id-index",
  KeyConditionExpression: "user_id = :uid",
  ExpressionAttributeValues: { ":uid": Number(userId) },
}));

// 更新
await docClient.send(new UpdateCommand({
  TableName: "favorite_places",
  Key: { id: target.id },
  UpdateExpression: "set wave_cache = :wc, updated_at = :ua",
  ExpressionAttributeValues: {
    ":wc": wave_cache,
    ":ua": new Date().toISOString(),
  },
}));
```

---

## 5. 認証

### 現在の実装

JWT やセッションCookieを使わない、シンプルな実装。

```
1. ログインフォーム送信
2. サーバーが DynamoDB でユーザー検索
3. パスワード一致確認
4. 成功したら userId などを LocalStorage に保存
5. ページ遷移時に LocalStorage を確認して認証状態を判定
```

```js
// App.js — ページ遷移のたびに認証チェック
useEffect(() => {
  const storedLoggedIn = localStorage.getItem("isLoggedIn");
  if (storedLoggedIn !== "true") {
    navigate("/"); // 未ログインはトップ（ログイン画面）へ
  }
}, [location]); // location（URL）が変わるたびに実行
```

### 改善余地

- パスワードが平文でDBに保存されている → `bcrypt` でハッシュ化すべき
- LocalStorage のフラグ操作で認証バイパスが可能 → JWTやサーバーセッションへの移行が望ましい

---

## 6. API通信

### フロントエンドからサーバーへ

**Fetch API**（ブラウザ標準）:
```js
// Login.js
const response = await fetch(`${API_BASE_URL}/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user_name, user_password }),
});
const data = await response.json();
```

**Axios**（ライブラリ）:
```js
// SaveDataCache.js
const response = await axios.put(`${API_BASE_URL}/api/favorites/cache`, {
  user_id: userId,
  wave_cache: rawData,
});
// Axios は response.data に自動でパースされた値が入る
```

### サーバーから外部API（Stormglass）へ

```js
// server.js
const response = await axios.get("https://api.stormglass.io/v2/weather/point", {
  params: {
    lat,
    lng,
    params: "waveHeight,wavePeriod,windDirection",
    start: startDate,
    end: endDate,
  },
  headers: { Authorization: process.env.STORMGLASS_API_KEY },
});
```

サーバーがAPIキーを持つことで、フロントエンドにキーが露出しない。

### 開発時のプロキシ設定

```json
// client/package.json
"proxy": "http://localhost:8080"
```

`/api/...` へのリクエストを自動でバックエンドの8080番ポートに転送する。  
本番では不要（同一オリジンか、明示的なURLを使う）。

---

## 7. 状態管理

このアプリは Redux や Zustand などの外部ライブラリを使わず、  
React 組み込みの `useState` だけで状態管理している。

### 状態の分類

| コンポーネント | 状態 | 説明 |
|--------------|------|------|
| App.js | `isLoggedIn`, `currentUser`, `username` | 認証状態（アプリ全体） |
| WaveChart.js | `chartData`, `rawWaveData`, `days`, `loading` | グラフ・データ |
| FavoritePlaceList.js | `favorites`, `selectedItem`, `isEditModalOpen` | リスト・モーダル |
| Login.js | `formValues`, `formErrors`, `isSubmitting` | フォーム |

### データの流れ

```
App.js（認証状態を持つ）
  ↓ props で渡す
FavoritePlaceList.js / WaveChart.js
```

スケールしたら `useContext` や外部ライブラリへの移行を検討。

---

## 8. データキャッシュ

波情報APIの呼び出し回数を減らすため、3層のキャッシュを使っている。

```
Stormglass API
    ↓ 取得
メモリ（useState）← 同セッション内での再利用
    ↓ お気に入り保存時
DynamoDB（wave_cache カラム）← セッションをまたいだ再利用
```

```js
// SaveDataCache.js — DynamoDB にキャッシュ保存
const SaveWaveCache = async (userId, coord, rawData) => {
  await axios.put(`${API_BASE_URL}/api/favorites/cache`, {
    user_id: userId,
    latitude: coord.lat,
    longitude: coord.lng,
    wave_cache: rawData,          // 波予報データをまるごと保存
    updated_at: new Date().toISOString(),
  });
};
```

---

## 9. グラフ描画（Chart.js）

### Chart.js とは

Canvas要素にグラフを描画するライブラリ。React専用ではないため、  
`useRef` でCanvas要素を直接参照して使う。

### 実装パターン

```js
// WaveChart.js
const chartRef = useRef(null);       // <canvas ref={chartRef} />
const chartInstance = useRef(null);  // Chart インスタンスを保持

useEffect(() => {
  if (!chartData || !chartRef.current) return;

  const ctx = chartRef.current.getContext("2d");

  // 既存グラフを破棄（二重描画バグを防ぐ）
  if (chartInstance.current) {
    chartInstance.current.destroy();
  }

  chartInstance.current = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,          // 親要素のサイズに追従
      maintainAspectRatio: false, // 高さを CSS で自由に指定できる
      scales: {
        x: { ticks: { maxTicksLimit: 12 } }, // X軸の目盛り数を制限
        y: { beginAtZero: true },
      },
    },
  });

  return () => chartInstance.current?.destroy(); // クリーンアップ
}, [chartData]);
```

### データ形式

```js
setChartData({
  labels: ["2024-01-01 00:00", "2024-01-01 01:00", ...], // X軸ラベル
  datasets: [{
    label: "波高 (m)",
    data: [1.2, 1.5, 1.8, ...],  // Y軸データ
    borderColor: "#36A2EB",
    backgroundColor: "rgba(54, 162, 235, 0.2)",
    fill: true,     // 線の下を塗りつぶす
    tension: 0.3,   // 線を滑らかにする（0=直線、1=曲線）
  }],
});
```

---

## 10. 地図表示（React Leaflet）

### React Leaflet とは

地図ライブラリ「Leaflet」のReactラッパー。  
地図・マーカー・クリックイベントをコンポーネントとして扱える。

### 基本的な使い方

```jsx
<MapContainer center={[35.306, 139.485]} zoom={10}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <Marker position={[35.306, 139.485]}>
    <Popup>クリックした地点</Popup>
  </Marker>
</MapContainer>
```

- `TileLayer` : 地図の背景画像（OpenStreetMap を使用）
- `Marker` : ピン
- `Popup` : クリックで表示される吹き出し

---

## 11. インフラ・デプロイ

### LocalStack

AWSサービスをローカルで動かすツール。実際のAWSを使わずに開発・テストできる。

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:3.4.0
    ports:
      - "4566:4566"       # すべてのAWSサービスがこのポートで動く
    environment:
      SERVICES: s3,dynamodb,lambda,iam
      DEFAULT_REGION: ap-northeast-1
```

アプリ側はエンドポイントURLを切り替えるだけで対応:

```js
// server.js
if (process.env.AWS_ENDPOINT_URL) {
  dynamoConfig.endpoint = process.env.AWS_ENDPOINT_URL; // "http://localhost:4566"
}
```

### Terraform

インフラをコードで定義する（Infrastructure as Code）。  
「どんなAWSリソースを作るか」をファイルに書いて管理する。

```
terraform/
  ├── main.tf       # リソース定義
  ├── variables.tf  # 変数
  └── outputs.tf    # 出力値
```

### デプロイ構成（本番）

```
S3（静的ファイル）← React ビルド結果
    ↓ CloudFront 経由で配信
ブラウザ
    ↓ API呼び出し
API Gateway → Lambda（Express + serverless-http）
    ↓
DynamoDB
```

### よく使うコマンド

```bash
# 依存パッケージを全インストール
npm run install-all

# 開発サーバー起動（フロント・バックエンド同時）
npm start

# React をビルド
npm run build

# LocalStack 起動
docker-compose up -d
```

---

## 技術選定のまとめ

| 課題 | 採用技術 | 理由 |
|------|---------|------|
| UIの状態管理 | React useState | 規模が小さいため外部ライブラリ不要 |
| ページ遷移 | React Router v7 | SPA標準のルーティング |
| DBアクセス | AWS SDK v3 | DynamoDB のための公式SDK |
| データ永続化 | DynamoDB | サーバーレス・スケーラブル |
| API呼び出し | Fetch / Axios | Fetch は標準、Axiosはより機能が多い |
| グラフ | Chart.js | 軽量・柔軟・ドキュメントが豊富 |
| 地図 | React Leaflet | 無料・OSMと組み合わせ可能 |
| ローカル開発 | LocalStack | AWS環境をそのままローカルで再現 |
