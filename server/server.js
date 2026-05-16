const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const {
  PutCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const app = express();

// CORS & JSONのデータ受信を許可
app.use(cors());
app.use(bodyParser.json());

// JWT 認証ミドルウェア（/api/* の全ルートに適用）
app.use("/api", (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "認証が必要です" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "トークンが無効です" });
  }
});

// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: "host.docker.internal",
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT,
// });

const dynamoConfig = {
  region: process.env.AWS_DEFAULT_REGION || "ap-northeast-1",
};
// LocalStack環境のみエンドポイントとダミー認証情報を使用
// AWS本番ではAWS_ENDPOINT_URLが未設定のためIAMロールが自動で使われる
if (process.env.AWS_ENDPOINT_URL) {
  dynamoConfig.endpoint = process.env.AWS_ENDPOINT_URL;
  dynamoConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  };
}
const client = new DynamoDBClient(dynamoConfig);
const docClient = DynamoDBDocumentClient.from(client);

// **ログインAPI**
app.post("/login", async (req, res) => {
  const { user_name, user_password } = req.body;

  console.log("[Server] 入力されたユーザー名:", user_name);
  console.log("[Server] 入力されたパスワード:", user_password);

  try {
    const { Items } = await docClient.send(
      new ScanCommand({
        TableName: "user_login",
        FilterExpression: "user_name = :un",
        ExpressionAttributeValues: { ":un": user_name },
      }),
    );
    const Item = Items?.[0];

    if (Item && Item.user_password === user_password) {
      console.log("[Server] ログイン成功:", Item);
      const token = jwt.sign({ userId: Item.id }, JWT_SECRET, {
        expiresIn: "24h",
      });
      res.json({
        success: true,
        message: "ログイン成功！",
        id: Item.id,
        user_name: Item.user_name,
        token,
      });
    } else {
      res.status(401).json({
        success: false,
        message: "ユーザー名またはパスワードが違います",
      });
    }
  } catch (error) {
    console.error("[Server] エラー:", error);
    res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// **波情報を取得**
app.get("/api/wave-data", async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.STORMGLASS_API_KEY;

  if (!lat || !lng) {
    return res.status(400).json({ error: "座標(lat, lng)が足りません" });
  }
  console.log(`[Server] リクエスト受信: lat=${lat}, lng=${lng}`);

  try {
    // Stormglass API
    const response = await axios.get(
      "https://api.stormglass.io/v2/weather/point",
      {
        params: {
          lat: lat,
          lng: lng,
          params: "waveHeight,wavePeriod,windDirection",
        },
        headers: {
          Authorization: apiKey,
        },
      },
    );

    // metaData 取得ログ
    console.log("[Server] Stormglass meta:", response.data.meta);

    res.json({
      ...response.data,
      rateLimit: {
        remaining:
          response.data.meta.dailyQuota - response.data.meta.requestCount,
        limit: response.data.meta.dailyQuota,
      },
    });
  } catch (error) {
    console.error("[Server] API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Stormglassからのデータ取得に失敗しました" });
  }
});

// お気に入りポイントの登録
app.post("/api/favorites", async (req, res) => {
  const { user_id, point_name, latitude, longitude, wave_cache } = req.body;

  // バリデーション：ユーザーIDがないと外部キー制約でエラーになるため
  if (!user_id) {
    console.log("[Server] ログインしてください");
    return res
      .status(400)
      .json({ success: false, message: "ログインが必要です" });
  }

  try {
    const params = {
      TableName: "favorite_places",
      Item: {
        id: Date.now().toString(),
        user_id: Number(user_id),
        point_name: point_name,
        latitude: latitude,
        longitude: longitude,
        wave_cache: wave_cache,
        updated_at: new Date().toISOString(),
      },
    };

    await docClient.send(new PutCommand(params));
    res.json({
      success: true,
      message: "お気に入りに追加しました",
      data: params.Item,
    });
  } catch (error) {
    console.error("[Server] DB保存エラー:", error);
    res.status(500).json({ success: false, message: "保存に失敗しました" });
  }
});

// ユーザ別　お気に入りポイント一覧表示
app.get("/api/favorites/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const params = {
      TableName: "favorite_places",
      IndexName: "user_id-index",
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": Number(userId) },
    };
    const { Items } = await docClient.send(new QueryCommand(params));
    res.json(Items);
  } catch (err) {
    console.error("[Server] DynamoDB取得失敗:", err);
    res.status(500).send("データ取得失敗");
  }
});

// キャッシュデータを更新するエンドポイント
const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");

app.put("/api/favorites/cache", async (req, res) => {
  try {
    const { user_id, latitude, longitude, wave_cache } = req.body;

    // user_id-index で該当ユーザーのお気に入りを取得し、座標で絞り込む
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: "favorite_places",
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": Number(user_id) },
      }),
    );

    const target = Items?.find(
      (item) => item.latitude === latitude && item.longitude === longitude,
    );

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "該当するお気に入り地点が見つかりません",
      });
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: "favorite_places",
        Key: { id: target.id },
        UpdateExpression: "set wave_cache = :wc, updated_at = :ua",
        ExpressionAttributeValues: {
          ":wc": wave_cache,
          ":ua": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    res.json({ success: true, data: result.Attributes });
  } catch (err) {
    console.error("[Server] DB更新エラー:", err);
    res.status(500).json({
      success: false,
      message: "サーバー側でのキャッシュ保存に失敗しました",
    });
  }
});

// お気に入りポイント削除
app.delete("/api/favorites/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: "favorite_places",
        Key: { id: id },
      }),
    );
    res.json({ success: true, message: "削除しました" });
  } catch (err) {
    console.error("[Server] DynamoDB削除失敗:", err);
    res.status(500).json({ success: false, message: "削除に失敗しました" });
  }
});

// お気に入りポイントの編集
app.patch("/api/favorites/:id", async (req, res) => {
  const { id } = req.params;
  const { point_name } = req.body;
  try {
    const params = {
      TableName: "favorite_places",
      Key: { id: id },
      UpdateExpression: "set point_name = :pn, updated_at = :ua",
      ExpressionAttributeValues: {
        ":pn": point_name,
        ":ua": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    };

    const result = await docClient.send(new UpdateCommand(params));
    res.json({ success: true, data: result.Attributes });
  } catch (err) {
    console.error("[Server] DynamoDB更新エラー:", err);
    res.status(500).json({ success: false, message: "更新に失敗しました" });
  }
});

// **サーバー起動**
// app.listen(PORT, () => {
//   console.log(`[Server] ✅ サーバー起動: http://localhost:${PORT}`);
// });

// Lambda
const serverless = require("serverless-http");
module.exports.handler = serverless(app);
