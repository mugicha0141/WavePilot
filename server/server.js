const express = require("express");
const cors = require("cors");
const bodyParpaser = require("body-parser");
const { Pool } = require("pg");
require("dotenv").config();

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
      [user_name, user_password]
    );

    console.log("取得したデータ:", result.rows);

    if (result.rows.length > 0) {
      res.json({ success: true, message: "ログイン成功！" });
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

// **サーバー起動**
app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
