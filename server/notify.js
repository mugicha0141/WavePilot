const axios = require("axios");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const line = require("@line/bot-sdk");

const COMPASS = ["北","北北東","北東","東北東","東","東南東","南東","南南東",
                 "南","南南西","南西","西南西","西","西北西","北西","北北西"];
const ARROWS = ["↑","↗","→","↘","↓","↙","←","↖"];
const degToCompass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
const degToArrow = (deg) => ARROWS[Math.round(((deg + 180) % 360) / 45) % 8];

const dynamoConfig = {
  region: process.env.AWS_DEFAULT_REGION || "ap-northeast-1",
};
if (process.env.AWS_ENDPOINT_URL) {
  dynamoConfig.endpoint = process.env.AWS_ENDPOINT_URL;
  dynamoConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  };
}
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient(dynamoConfig));

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

module.exports.handler = async (event) => {
  // EventBridge から渡される（web: { user_id, lat, lng, place_name }、LINE: 同様）
  const { user_id, lat: eventLat, lng: eventLng, place_name: eventPlaceName } = event;
  console.log(`[Notify] 実行: user_id=${user_id}`);

  // LINE user_id を取得
  const { Item } = await docClient.send(new GetCommand({
    TableName: "notification_settings",
    Key: { user_id },
  }));

  if (!Item || !Item.line_user_id) {
    console.log("[Notify] 通知設定なし、またはLINE未連携");
    return;
  }

  // イベントの値を優先、なければ DynamoDB の値を使用
  const lat       = eventLat       ?? Item.lat;
  const lng       = eventLng       ?? Item.lng;
  const placeName = eventPlaceName ?? Item.place_name;

  // Stormglass から今日のJST 0時〜1週間分取得
  const now = new Date();
  const JST = 9 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const jstSec = nowSec + JST;
  const startSec = jstSec - (jstSec % 86400) - JST;

  const response = await axios.get(
    "https://api.stormglass.io/v2/weather/point",
    {
      params: {
        lat,
        lng,
        params: "waveHeight,windDirection,windSpeed",
        start: startSec,
      },
      headers: { Authorization: process.env.STORMGLASS_API_KEY },
    }
  );

  const hours = response.data.hours || [];

  // 今日の JST 5時〜19時に絞り込む
  const todayJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayDate = todayJST.getUTCDate();

  const filtered = hours.filter(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    return hJST.getUTCDate() === todayDate
      && hJST.getUTCHours() >= 5
      && hJST.getUTCHours() <= 19;
  });

  // 今日の日付（JST）
  const month = todayJST.getUTCMonth() + 1;
  const date  = todayJST.getUTCDate();

  // メッセージ生成
  const messageLines = filtered.map(h => {
    const hJST = new Date(new Date(h.time).getTime() + 9 * 60 * 60 * 1000);
    const hour = hJST.getUTCHours();
    const label = hour < 12 ? `AM${hour}時` : `PM${hour - 12}時`;
    const wave = (h.waveHeight?.sg ?? h.waveHeight?.noaa ?? 0).toFixed(1);
    const spd  = (h.windSpeed?.sg ?? h.windSpeed?.noaa ?? 0).toFixed(1);
    const deg  = h.windDirection?.sg ?? h.windDirection?.noaa ?? 0;
    return `${label} 波高:${wave}m 風速:${spd}m/s 風向き:${degToArrow(deg)}${degToCompass(deg)}`;
  });

  const message = `🌊 ${placeName} 本日の波情報（${month}/${date}）\n\n` + messageLines.join("\n");

  // LINE に送信
  await lineClient.pushMessage({
    to: Item.line_user_id,
    messages: [{ type: "text", text: message }],
  });

  console.log(`[Notify] 送信完了: ${Item.place_name} → ${Item.line_user_id}`);
};
