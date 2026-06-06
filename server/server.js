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
  GetCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const line = require("@line/bot-sdk");
const { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand } = require("@aws-sdk/client-scheduler");

const app = express();

// CORS & JSONのデータ受信を許可
app.use(cors());
// LINE署名検証用に生データを rawBody に保存しつつ JSON に変換
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// JWT 認証ミドルウェア（ローカル環境のみ）
// 本番はAPI GatewayのCognito JWT Authorizerが検証するためLambda側では不要
if (process.env.JWT_SECRET) {
  app.use("/api", (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "認証が必要です" });
    try {
      jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "トークンが無効です" });
    }
  });
}

// リクエストからuser_idを取得するヘルパー
// 本番: API GatewayがCognitoトークンを検証済みのためrequestContextからsubを取得
// ローカル: カスタムJWTのuserIdクレームを取得
const getUserId = (req) => {
  const sub = req.apiGateway?.event?.requestContext?.authorizer?.jwt?.claims?.sub;
  if (sub) return sub;
  if (process.env.JWT_SECRET) {
    const token = req.headers.authorization?.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return String(payload.userId);
  }
  return null;
};

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

// EventBridge Scheduler クライアント
const schedulerConfig = {
  region: process.env.AWS_DEFAULT_REGION || "ap-northeast-1",
};
if (process.env.AWS_ENDPOINT_URL) {
  schedulerConfig.endpoint = process.env.AWS_ENDPOINT_URL;
  schedulerConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  };
}
const schedulerClient = new SchedulerClient(schedulerConfig);

// LINE クライアント（メッセージ送信用）
const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

// 風向きユーティリティ
const COMPASS_LINE = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
const ARROWS_LINE  = ["↑","↗","→","↘","↓","↙","←","↖"];
const degToCompassL = (deg) => COMPASS_LINE[Math.round(deg / 22.5) % 16];
const degToArrowL   = (deg) => ARROWS_LINE[Math.round(((deg + 180) % 360) / 45) % 8];

// EventBridge スケジュール作成・更新
const upsertSchedule = async (scheduleName, notify_time, lambdaInput) => {
  const [hour, minute] = notify_time.split(":").map(Number);
  const utcHour = (hour - 9 + 24) % 24;
  const params = {
    Name: scheduleName,
    ScheduleExpression: `cron(${minute} ${utcHour} * * ? *)`,
    ScheduleExpressionTimezone: "UTC",
    Target: {
      Arn: process.env.NOTIFY_LAMBDA_ARN,
      RoleArn: process.env.SCHEDULER_ROLE_ARN,
      Input: JSON.stringify(lambdaInput),
    },
    FlexibleTimeWindow: { Mode: "OFF" },
  };
  try {
    await schedulerClient.send(new CreateScheduleCommand(params));
  } catch (err) {
    if (err.name === "ConflictException") {
      await schedulerClient.send(new UpdateScheduleCommand(params));
    } else throw err;
  }
};

// EventBridge スケジュール削除
const deleteSchedule = async (scheduleName) => {
  try {
    await schedulerClient.send(new DeleteScheduleCommand({ Name: scheduleName }));
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") throw err;
  }
};

// お気に入り一覧取得
const getFavorites = async (user_id) => {
  const { Items } = await docClient.send(new QueryCommand({
    TableName: "favorite_places",
    IndexName: "user_id-index",
    KeyConditionExpression: "user_id = :uid",
    ExpressionAttributeValues: { ":uid": user_id },
  }));
  return Items || [];
};

// 会話ステート管理
const setConvState = async (user_id, state) => {
  await docClient.send(new UpdateCommand({
    TableName: "notification_settings",
    Key: { user_id },
    UpdateExpression: "set conv_state = :s",
    ExpressionAttributeValues: { ":s": state },
  }));
};
const clearConvState = async (user_id) => {
  await docClient.send(new UpdateCommand({
    TableName: "notification_settings",
    Key: { user_id },
    UpdateExpression: "REMOVE conv_state",
  }));
};

// メニュー表示（吹き出しボタン）
const showMenu = (replyToken) => lineClient.replyMessage({
  replyToken,
  messages: [{
    type: "template",
    altText: "メニュー",
    template: {
      type: "buttons",
      text: "メニューを選んでください",
      actions: [
        { type: "message", label: "🌊 波情報", text: "波情報" },
        { type: "message", label: "🔔 通知設定", text: "通知設定" },
      ],
    },
  }],
});

// キャッシュデータから今日の波情報テキストを生成（null = データなし）
const formatWaveMessageFromCache = (waveCache, placeName) => {
  if (!waveCache || waveCache.length === 0) return null;
  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayDate = todayJST.getUTCDate();
  const month = todayJST.getUTCMonth() + 1;
  const date  = todayJST.getUTCDate();
  const filtered = waveCache.filter(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    return hJST.getUTCDate() === todayDate && hJST.getUTCHours() >= 5 && hJST.getUTCHours() <= 19;
  });
  if (filtered.length === 0) return null;
  const lines = filtered.map(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    const hour = hJST.getUTCHours();
    const label = hour < 12 ? `AM${hour}時` : `PM${hour - 12}時`;
    const wave = (h.waveHeight?.sg ?? h.waveHeight?.noaa ?? 0).toFixed(1);
    const spd  = (h.windSpeed?.sg  ?? h.windSpeed?.noaa  ?? 0).toFixed(1);
    const deg  = h.windDirection?.sg ?? h.windDirection?.noaa ?? 0;
    return `${label} 波高:${wave}m 風速:${spd}m/s 風向:${degToArrowL(deg)}${degToCompassL(deg)}`;
  });
  return `🌊 ${placeName} 本日の波情報（${month}/${date}）\n\n${lines.join("\n")}`;
};

// Stormglassから取得してキャッシュ更新し、今日のメッセージを返す
const fetchAndCacheWaveData = async (favId, lat, lng, placeName) => {
  const JST = 9 * 3600;
  const jstSec = Math.floor(Date.now() / 1000) + JST;
  const startSec = jstSec - (jstSec % 86400) - JST;
  const response = await axios.get("https://api.stormglass.io/v2/weather/point", {
    params: { lat, lng, params: "waveHeight,windDirection,windSpeed", start: startSec },
    headers: { Authorization: process.env.STORMGLASS_API_KEY },
  });
  const hours = response.data.hours || [];
  await docClient.send(new UpdateCommand({
    TableName: "favorite_places",
    Key: { id: favId },
    UpdateExpression: "set wave_cache = :c, updated_at = :u",
    ExpressionAttributeValues: { ":c": hours, ":u": new Date().toISOString() },
  }));
  return formatWaveMessageFromCache(hours, placeName) || `🌊 ${placeName}\n本日のデータが見つかりませんでした。`;
};

// スポット名をボタンにしたメッセージ配列を生成（4件ずつ分割）
const makeSpotsButtons = (favs) => {
  const messages = [];
  for (let i = 0; i < favs.length; i += 4) {
    const chunk = favs.slice(i, i + 4);
    messages.push({
      type: "template",
      altText: "スポットを選んでください",
      template: {
        type: "buttons",
        text: "スポットを選んでください",
        actions: chunk.map(f => ({
          type: "message",
          label: f.point_name.substring(0, 20),
          text: f.point_name,
        })),
      },
    });
  }
  return messages;
};

// 通知設定用（ステータス付きボタン）
const makeNotifyButtons = (favs, schedules) => {
  const messages = [];
  for (let i = 0; i < favs.length; i += 4) {
    const chunk = favs.slice(i, i + 4);
    messages.push({
      type: "template",
      altText: "通知設定するスポットを選んでください",
      template: {
        type: "buttons",
        text: "通知設定",
        actions: chunk.map(f => {
          const s = schedules[f.id];
          const label = s
            ? `🔔 ${f.point_name.substring(0, 10)} ${s.notify_time}`
            : `🔕 ${f.point_name.substring(0, 18)}`;
          return { type: "message", label: label.substring(0, 20), text: f.point_name };
        }),
      },
    });
  }
  return messages;
};

// 今日の波情報テキストを生成（Stormglass から取得）
const fetchWaveMessage = async (lat, lng, placeName) => {
  const JST = 9 * 3600;
  const jstSec = Math.floor(Date.now() / 1000) + JST;
  const startSec = jstSec - (jstSec % 86400) - JST;

  const response = await axios.get("https://api.stormglass.io/v2/weather/point", {
    params: { lat, lng, params: "waveHeight,windDirection,windSpeed", start: startSec },
    headers: { Authorization: process.env.STORMGLASS_API_KEY },
  });

  const hours = response.data.hours || [];
  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayDate = todayJST.getUTCDate();
  const month = todayJST.getUTCMonth() + 1;
  const date  = todayJST.getUTCDate();

  const filtered = hours.filter(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    return hJST.getUTCDate() === todayDate && hJST.getUTCHours() >= 5 && hJST.getUTCHours() <= 19;
  });

  const lines = filtered.map(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    const hour = hJST.getUTCHours();
    const label = hour < 12 ? `AM${hour}時` : `PM${hour - 12}時`;
    const wave = (h.waveHeight?.sg ?? h.waveHeight?.noaa ?? 0).toFixed(1);
    const spd  = (h.windSpeed?.sg  ?? h.windSpeed?.noaa  ?? 0).toFixed(1);
    const deg  = h.windDirection?.sg ?? h.windDirection?.noaa ?? 0;
    return `${label} 波高:${wave}m 風速:${spd}m/s 風向:${degToArrowL(deg)}${degToCompassL(deg)}`;
  });

  return `🌊 ${placeName} 本日の波情報（${month}/${date}）\n\n` +
    (lines.length > 0 ? lines.join("\n") : "データが取得できませんでした");
};

// 連携済みユーザーへのメッセージ処理（会話ステートマシン）
const handleLinkedMessage = async (notifItem, text, replyToken) => {
  const userId    = notifItem.user_id;
  const convState = notifItem.conv_state || "";
  const schedules = notifItem.schedules || {};

  // メインコマンドは状態に関わらず優先処理
  if (text === "波情報") {
    const favs = await getFavorites(userId);
    if (favs.length === 0) {
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "お気に入りポイントがありません。\nアプリからポイントを登録してください。" }],
      });
    }
    await setConvState(userId, "WAVE_SPOT");
    return lineClient.replyMessage({ replyToken, messages: makeSpotsButtons(favs) });
  }

  if (text === "通知設定") {
    const favs = await getFavorites(userId);
    if (favs.length === 0) {
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "お気に入りポイントがありません。\nアプリからポイントを登録してください。" }],
      });
    }
    await setConvState(userId, "NOTIFY_SPOT");
    return lineClient.replyMessage({ replyToken, messages: makeNotifyButtons(favs, schedules) });
  }

  // 波情報: キャッシュ更新待ち（「更新」コマンド）
  if (convState.startsWith("WAVE_UPDATE:")) {
    if (text === "更新") {
      const favId = convState.replace("WAVE_UPDATE:", "");
      const favs  = await getFavorites(userId);
      const fav   = favs.find(f => f.id === favId);
      if (!fav) {
        await clearConvState(userId);
        return showMenu(replyToken);
      }
      try {
        const msg = await fetchAndCacheWaveData(favId, fav.latitude, fav.longitude, fav.point_name);
        await clearConvState(userId);
        return lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: msg }] });
      } catch {
        return lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: "データの取得に失敗しました。しばらくしてからお試しください。" }] });
      }
    }
    // 更新以外が来たらリセットしてメニューへ
    await clearConvState(userId);
    return showMenu(replyToken);
  }

  // 波情報: スポット選択待ち
  if (convState === "WAVE_SPOT") {
    const favs = await getFavorites(userId);
    const matched = favs.find(f => f.point_name === text);
    if (!matched) {
      return lineClient.replyMessage({ replyToken, messages: makeSpotsButtons(favs) });
    }
    // キャッシュから今日のデータを表示
    const msg = formatWaveMessageFromCache(matched.wave_cache, matched.point_name);
    await setConvState(userId, `WAVE_UPDATE:${matched.id}`);
    if (msg) {
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: "text",
          text: `${msg}\n\n最新情報に更新するには「更新」と送ってください`,
        }],
      });
    } else {
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: `📍 ${matched.point_name}\nデータがないか期間外です。\n「更新」と送ると最新データを取得します。` }],
      });
    }
  }

  // 通知設定: スポット選択待ち
  if (convState === "NOTIFY_SPOT") {
    const favs = await getFavorites(userId);
    const matched = favs.find(f => f.point_name === text);
    if (!matched) {
      return lineClient.replyMessage({ replyToken, messages: makeNotifyButtons(favs, schedules) });
    }
    await setConvState(userId, `NOTIFY_ACTION:${matched.id}`);
    const s = schedules[matched.id];
    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: "text",
        text: `📍 ${matched.point_name}\n${s ? `現在の設定: ${s.notify_time}` : "未設定"}\n\n操作を選んでください`,
        quickReply: {
          items: [
            { type: "action", action: { type: "message", label: "通知を設定", text: "通知を設定" } },
            ...(s ? [{ type: "action", action: { type: "message", label: "通知を削除", text: "通知を削除" } }] : []),
            { type: "action", action: { type: "message", label: "← 戻る", text: "通知設定" } },
          ],
        },
      }],
    });
  }

  // 通知設定: 設定/削除 選択待ち
  if (convState.startsWith("NOTIFY_ACTION:")) {
    const favId = convState.replace("NOTIFY_ACTION:", "");
    const favs  = await getFavorites(userId);
    const fav   = favs.find(f => f.id === favId);

    if (text === "通知を設定") {
      await setConvState(userId, `NOTIFY_TIME:${favId}`);
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: `📍 ${fav?.point_name || ""}\n通知時刻を入力してください\n例: 07:00` }],
      });
    }
    if (text === "通知を削除") {
      await docClient.send(new UpdateCommand({
        TableName: "notification_settings",
        Key: { user_id: userId },
        UpdateExpression: "REMOVE schedules.#fid, conv_state",
        ExpressionAttributeNames: { "#fid": favId },
      }));
      await deleteSchedule(`wave-notify-${userId}-${favId}`);
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: `🗑️ ${fav?.point_name || ""}の通知を削除しました。` }],
      });
    }
    await clearConvState(userId);
    return showMenu(replyToken);
  }

  // 通知設定: 時刻入力待ち
  if (convState.startsWith("NOTIFY_TIME:")) {
    const favId = convState.replace("NOTIFY_TIME:", "");
    if (!/^\d{1,2}:\d{2}$/.test(text)) {
      return lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "時刻の形式が正しくありません。\n例: 07:00\n\n再度入力してください。" }],
      });
    }
    const favs = await getFavorites(userId);
    const fav  = favs.find(f => f.id === favId);
    if (!fav) {
      await clearConvState(userId);
      return showMenu(replyToken);
    }
    // schedules マップを初期化してからスポット設定
    await docClient.send(new UpdateCommand({
      TableName: "notification_settings",
      Key: { user_id: userId },
      UpdateExpression: "set schedules = if_not_exists(schedules, :empty)",
      ExpressionAttributeValues: { ":empty": {} },
    }));
    await docClient.send(new UpdateCommand({
      TableName: "notification_settings",
      Key: { user_id: userId },
      UpdateExpression: "set schedules.#fid = :s REMOVE conv_state",
      ExpressionAttributeNames: { "#fid": favId },
      ExpressionAttributeValues: {
        ":s": { place_name: fav.point_name, lat: fav.latitude, lng: fav.longitude, notify_time: text, enabled: true },
      },
    }));
    await upsertSchedule(
      `wave-notify-${userId}-${favId}`,
      text,
      { user_id: userId, lat: fav.latitude, lng: fav.longitude, place_name: fav.point_name }
    );
    return lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: `✅ 設定しました！\n📍 ${fav.point_name}\n⏰ 毎日${text}に波情報をお届けします🌊` }],
    });
  }

  // デフォルト: メニュー表示
  return showMenu(replyToken);
};

// LINE Webhook（JWT認証なし・LINEサーバーから直接届く）
app.post("/line/webhook", async (req, res) => {
  console.log("[LINE] webhook受信");
  try {
    const signature = req.headers["x-line-signature"];
    console.log("[LINE] signature:", signature ? "あり" : "なし", "rawBody:", req.rawBody ? "あり" : "なし");
    if (!signature || !req.rawBody) return res.status(400).send("Bad Request");
    const valid = line.validateSignature(req.rawBody, process.env.LINE_CHANNEL_SECRET, signature);
    console.log("[LINE] 署名検証:", valid ? "OK" : "NG");
    if (!valid) return res.status(401).send("Invalid signature");
  } catch (err) {
    console.error("[LINE] 署名検証エラー:", err);
    return res.status(500).send("Server Error");
  }

  const events = req.body.events || [];
  console.log("[LINE] events:", events.length);
  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const lineUserId = event.source.userId;
    const text = event.message.text.trim();

    // 連携済みかチェック
    const { Items: linkedItems } = await docClient.send(new ScanCommand({
      TableName: "notification_settings",
      FilterExpression: "line_user_id = :lid",
      ExpressionAttributeValues: { ":lid": lineUserId },
    }));

    if (linkedItems && linkedItems.length > 0) {
      await handleLinkedMessage(linkedItems[0], text, event.replyToken);
      continue;
    }

    // 未連携 → 4桁コードで連携
    if (!/^\d{4}$/.test(text)) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: "メッセージありがとうございます。\n4桁の連携コードをアプリから確認して送ってください。" }],
      });
      continue;
    }

    const { Items } = await docClient.send(new ScanCommand({
      TableName: "notification_settings",
      FilterExpression: "link_code = :code",
      ExpressionAttributeValues: { ":code": text },
    }));

    if (!Items || Items.length === 0) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: "連携コードが見つかりません。アプリで確認してください。" }],
      });
      continue;
    }

    await docClient.send(new UpdateCommand({
      TableName: "notification_settings",
      Key: { user_id: Items[0].user_id },
      UpdateExpression: "set line_user_id = :lid",
      ExpressionAttributeValues: { ":lid": lineUserId },
    }));

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: "text",
        text: "WavePilotと連携しました！🎉",
        quickReply: {
          items: [
            { type: "action", action: { type: "message", label: "🌊 波情報", text: "波情報" } },
            { type: "action", action: { type: "message", label: "🔔 通知設定", text: "通知設定" } },
          ],
        },
      }],
    });
  }

  res.status(200).end();
});

// 通知設定を登録・更新（スポットごと）
app.post("/api/notifications", async (req, res) => {
  const user_id = getUserId(req);
  if (!user_id) return res.status(401).json({ success: false, message: "ログインが必要です" });

  const { fav_id, notify_time, lat, lng, place_name } = req.body;

  // 既存レコードから link_code を引き継ぐ（なければ新規生成）
  const { Item: existing } = await docClient.send(new GetCommand({
    TableName: "notification_settings",
    Key: { user_id },
  }));
  const link_code = existing?.link_code || String(Math.floor(1000 + Math.random() * 9000));

  // レコードが存在しない場合は link_code と schedules を初期化
  await docClient.send(new UpdateCommand({
    TableName: "notification_settings",
    Key: { user_id },
    UpdateExpression: "set link_code = if_not_exists(link_code, :lc), schedules = if_not_exists(schedules, :empty)",
    ExpressionAttributeValues: { ":lc": link_code, ":empty": {} },
  }));

  // 対象スポットの通知設定を更新
  await docClient.send(new UpdateCommand({
    TableName: "notification_settings",
    Key: { user_id },
    UpdateExpression: "set schedules.#fid = :s",
    ExpressionAttributeNames: { "#fid": fav_id },
    ExpressionAttributeValues: {
      ":s": { place_name, lat, lng, notify_time, enabled: true },
    },
  }));

  // EventBridge スケジュールを登録
  await upsertSchedule(
    `wave-notify-${user_id}-${fav_id}`,
    notify_time,
    { user_id, lat, lng, place_name }
  );

  res.json({ success: true, link_code });
});

// 通知設定を取得
app.get("/api/notifications", async (req, res) => {
  const user_id = getUserId(req);
  if (!user_id) return res.status(401).json({ success: false, message: "ログインが必要です" });

  const { Item } = await docClient.send(new GetCommand({
    TableName: "notification_settings",
    Key: { user_id },
  }));

  res.json(Item || null);
});

// 通知設定を削除（スポットごと）
app.delete("/api/notifications/:favId", async (req, res) => {
  const user_id = getUserId(req);
  if (!user_id) return res.status(401).json({ success: false, message: "ログインが必要です" });

  const favId = req.params.favId;

  await docClient.send(new UpdateCommand({
    TableName: "notification_settings",
    Key: { user_id },
    UpdateExpression: "REMOVE schedules.#fid",
    ExpressionAttributeNames: { "#fid": favId },
  }));

  await deleteSchedule(`wave-notify-${user_id}-${favId}`);

  res.json({ success: true });
});

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
          params: "waveHeight,wavePeriod,windDirection,windSpeed",
          start: (() => {
            const JST = 9 * 3600;
            const nowSec = Math.floor(Date.now() / 1000);
            const jstSec = nowSec + JST;
            return jstSec - (jstSec % 86400) - JST; // JST 0時を UTC 秒で返す
          })(),
        },
        headers: {
          Authorization: apiKey,
        },
      },
    );

    res.json({
      ...response.data,
      rateLimit: {
        remaining: response.data.meta.dailyQuota - response.data.meta.requestCount,
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
  const { point_name, latitude, longitude, wave_cache } = req.body;
  const user_id = getUserId(req);

  if (!user_id) {
    return res.status(401).json({ success: false, message: "ログインが必要です" });
  }

  try {
    const params = {
      TableName: "favorite_places",
      Item: {
        id: Date.now().toString(),
        user_id: user_id,
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
  const user_id = getUserId(req);

  try {
    const params = {
      TableName: "favorite_places",
      IndexName: "user_id-index",
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": user_id },
    };
    const { Items } = await docClient.send(new QueryCommand(params));
    res.json(Items);
  } catch (err) {
    console.error("[Server] DynamoDB取得失敗:", err);
    res.status(500).send("データ取得失敗");
  }
});

// キャッシュデータを更新するエンドポイント
app.put("/api/favorites/cache", async (req, res) => {
  try {
    const { user_id, latitude, longitude, wave_cache } = req.body;

    // user_id-index で該当ユーザーのお気に入りを取得し、座標で絞り込む
    const { Items } = await docClient.send(new QueryCommand({
      TableName: "favorite_places",
      IndexName: "user_id-index",
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": getUserId(req) },
    }));

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
const PORT = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] ✅ サーバー起動: http://localhost:${PORT}`);
  });
}

// Lambda
const serverless = require("serverless-http");
module.exports.handler = serverless(app);
