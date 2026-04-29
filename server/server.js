const express = require("express");
const cors = require("cors");
const bodyParpaser = require("body-parser");
const { Pool } = require("pg");
require("dotenv").config();
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

// CORS & JSONのデータ受信を許可
app.use(cors());
app.use(bodyParpaser.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// **ログインAPI**
app.post("/server", async (req, res) => {
  const { user_name, user_password } = req.body;

  console.log("入力されたユーザー名:", user_name);
  console.log("入力されたパスワード:", user_password);

  try {
    // DBからユーザー情報を取得
    const result = await pool.query(
      "SELECT * FROM user_login WHERE user_name = $1 AND user_password = $2",
      [user_name, user_password],
    );

    console.log("取得したデータ:", result.rows);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({
        success: true,
        message: "ログイン成功！",
        id: user.id,
        user_name: user.user_name,
      });
    } else {
      res.status(401).json({
        success: false,
        message: "ユーザー名またはパスワードが違います",
      });
    }
  } catch (error) {
    console.error("エラー:", error);
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
  console.log(`リクエスト受信: lat=${lat}, lng=${lng}`);

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

    res.json(response.data);
  } catch (error) {
    console.error("API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Stormglassからのデータ取得に失敗しました" });
  }
});

// お気に入りポイントの登録
app.post("/api/favorites", async (req, res) => {
  console.log("お気に入り登録処理開始");
  const { user_id, point_name, latitude, longitude } = req.body;

  // バリデーション：ユーザーIDがないと外部キー制約でエラーになるため
  if (!user_id) {
    console.log("ログインしてくだいさい");
    return res
      .status(400)
      .json({ success: false, message: "ログインが必要です" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO favorite_places (user_id, point_name, latitude, longitude) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [user_id, point_name, latitude, longitude],
    );

    res.json({
      success: true,
      message: "お気に入りに追加しました",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("DB保存エラー:", error);
    res.status(500).json({ success: false, message: "保存に失敗しました" });
  }
});

// ユーザ別　お気に入りポイント一覧表示
app.get("/api/favorites/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // ログイン中のユーザーIDでフィルタリングして取得
    const result = await pool.query(
      `SELECT id, point_name, latitude, longitude 
      FROM favorite_places 
      WHERE user_id = $1 
      ORDER BY created_at DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("データ取得失敗");
  }
});

// キャッシュデータを更新するエンドポイント
app.put("/api/favorites/cache", async (req, res) => {
  try {
    // フロントエンドの saveWaveCache 関数から送られてくるボディを受け取る
    const { user_id, latitude, longitude, wave_cache } = req.body;

    const query = `
      UPDATE favorite_places 
      SET wave_cache = $1, updated_at = NOW() 
      WHERE user_id = $2 AND latitude = $3 AND longitude = $4
      RETURNING *; -- 更新後のデータを念のため返す設定
    `;

    const result = await pool.query(query, [
      wave_cache, // $1: JSON文字列
      user_id, // $2
      latitude, // $3
      longitude, // $4
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "該当するお気に入り地点が見つかりません",
      });
    }

    res.json({
      success: true,
      message: "キャッシュを更新しました",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("DB更新エラー:", err);
    res.status(500).json({
      success: false,
      message: "サーバー側でのキャッシュ保存に失敗しました",
    });
  }
});

// **サーバー起動**
app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
