import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  useMapEvents,
  Marker,
  Popup,
} from "react-leaflet";
import { Chart } from "chart.js/auto";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./WaveMap.css";

// マーカーのアイコン化けを防ぐ設定（Leafletのデフォルト設定）
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function WaveMap() {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [days, setDays] = useState(2); // デフォルトは2日分
  const [today, setToday] = useState("");
  // location の定義
  const [location, setLocation] = useState({ lat: 35.306, lng: 139.485 });
  // 表示用のState
  const [displayInfo, setDisplayInfo] = useState({ lat: 35.306, lng: 139.485 });

  // 1. 場所(location)が変わるたびにAPIからデータを取得
  useEffect(() => {
    const fetchWaveData = async () => {
      // fetchWaveData 内の url を修正
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${location.lat}&longitude=${location.lng}&hourly=wave_height&timezone=Asia%2FTokyo&forecast_days=${days}`;
      try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.hourly && json.hourly.wave_height.length > 0) {
          // 本日日付をセット
          const now = new Date();
          setToday(now.toLocaleDateString("ja-JP"));

          // 取得した瞬間の緯度経度を保存
          setDisplayInfo({ lat: location.lat, lng: location.lng });

          setChartData({
            // 横軸のフォーマットを MM-DD-hh:mm:ss
            labels: json.hourly.time.map((t) => {
              const d = new Date(t);
              const MM = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              const hh = String(d.getHours()).padStart(2, "0");
              return `${MM}-${dd}-${hh}:00`; // APIは1時間ごとなので分秒は00固定
            }),
            datasets: [
              {
                // 2. ラベルの先頭に数値を表示させる
                label: `波高(m)`,
                data: json.hourly.wave_height,
                borderColor: "rgb(54, 162, 235)",
                backgroundColor: "rgba(54, 162, 235, 0.2)",
                tension: 0.4,
                fill: true,
              },
            ],
          });
        }
      } catch (e) {
        console.error("データ取得に失敗しました", e);
      }
    };

    fetchWaveData();
  }, [location, days]); // locationが更新されたら再実行

  // 2. グラフの描画と破棄（メモリ管理）
  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    // すでにグラフがある場合は、一旦完全に破棄してキャンバスを真っさらにする
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [chartData]);

  // 3. マップクリック時のイベントコンポーネント
  function ClickHandler() {
    useMapEvents({
      click(e) {
        // 確実に lat と lng を取得
        const newLat = e.latlng.lat;
        const newLng = e.latlng.lng;

        console.log("取得した座標:", newLat, newLng);

        // 状態を更新
        setLocation({ lat: newLat, lng: newLng });
      },
    });

    // マーカーの位置も state に連動させる
    return <Marker position={[location.lat, location.lng]} />;
  }

  return (
    <div className="wave-dashboard">
      {/* 左半分：マップ */}
      <div className="map-section">
        <MapContainer
          center={[35.319, 139.546]}
          zoom={11}
          style={{ height: "100%", width: "100%" }} // Leaflet自体は高さ指定が必須
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickHandler />
        </MapContainer>
      </div>

      {/* 右半分：グラフ */}
      <div className="graph-section">
        <div className="graph-card">
          <h4
            style={{ borderBottom: "2px solid #36A2EB", paddingBottom: "10px" }}
          >
            波高データダッシュボード
            <span
              style={{ fontSize: "0.9rem", color: "#666", marginLeft: "10px" }}
            >
              [{today}]
            </span>
          </h4>
          {/* グラフのタイトルのすぐ下あたりに追加 */}
          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                marginRight: "10px",
                fontSize: "0.9rem",
                fontWeight: "bold",
              }}
            >
              表示期間:
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                padding: "5px 10px",
                borderRadius: "5px",
                border: "1px solid #ccc",
              }}
            >
              <option value={1}>1日（今日）</option>
              <option value={2}>2日（今日・明日）</option>
              <option value={3}>3日間</option>
              <option value={7}>7日間（週間予報）</option>
            </select>
          </div>
          <div
            style={{ marginBottom: "10px", fontSize: "0.9rem", color: "#444" }}
          >
            📍 測定地点: 緯度 {displayInfo.lat.toFixed(4)} / 経度{" "}
            {displayInfo.lng.toFixed(4)}
          </div>
          <div className="graph-container">
            <canvas ref={chartRef}></canvas>
          </div>
          <p className="hint-text">
            ※地図をクリックするとその地点の波高グラフに更新されます。
          </p>
        </div>
      </div>
    </div>
  );
}

export default WaveMap;
