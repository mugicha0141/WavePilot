import React, { useEffect, useRef, useState } from "react";
import { Chart } from "chart.js/auto";
import { Link } from "react-router-dom";
import "./WaveChart.css";
import FetchWaveData from "../utils/FetchWaveData";
import API_BASE_URL from "../config";
import authFetch from "../utils/authFetch";

const COMPASS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const degToCompass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
const degToArrow = (deg) => ARROWS[Math.round(deg / 45) % 8];

const WaveChart = ({ currentUser, location = { lat: 0, lng: 0 } }) => {
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [days, setDays] = useState(2);
  const [displayInfo, setDisplayInfo] = useState({ lat: 35.306, lng: 139.485 });
  const isFirstRender = useRef(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pointName, setPointName] = useState("");
  const [rawWaveData, setRawWaveData] = useState(null);
  const [rateLimit, setRateLimit] = useState(null);
  const windDataRef = useRef([]);

  const handleSaveFavorite = async () => {
    console.log("[Client] currentUserの実体:", currentUser);
    // ログインチェック
    if (!currentUser) {
      console.log("[Client] currentUserが空です");
      alert(
        "ログイン情報が見つかりません。一度ログアウトして再ログインしてください。",
      );
      return;
    }
    console.log("[Client] DEBUG: currentUserの実体:", currentUser);
    console.log("[Client] DEBUG: user_id:", currentUser.id);
    // 登録データ
    const favoriteData = {
      user_id: currentUser.id,
      point_name: pointName,
      latitude: displayInfo.lat,
      longitude: displayInfo.lng,
      wave_cache: rawWaveData,
    };

    console.log("[Client] IDプロパティの確認:", currentUser.id);

    try {
      const response = await authFetch(`${API_BASE_URL}/api/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(favoriteData),
      });
      const result = await response.json();

      if (result.success) {
        // 登録完了アラート
        alert(`${pointName} を登録しました！`);
        setIsModalOpen(false);
        setPointName("");
      } else {
        alert("登録に失敗しました: " + result.message);
      }
    } catch (error) {
      console.error("[Client] 通信エラー:", error);
      alert("サーバーとの通信に失敗しました。");
    }
  };

  // 【データ取得用】locationが変わった時だけAPIを叩く
  useEffect(() => {
    // 初回マウント時はレンダリングスキップ
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!location || location.lat === 0) return;
    // 座標が渡されたらAPIを叩く関数
    const GetWaveData = async () => {
      setLoading(true);
      try {
        console.log(
          `[Client] ${location.lat}, ${location.lng} の波データを取得中...`,
        );
        const res = await FetchWaveData(location.lat, location.lng);
        if (res && res.data && res.data.hours) {
          // 生データキャッシュ
          setRawWaveData(res.data.hours);
          setRateLimit(res.data.rateLimit);
          const rawHours = res.data.hours;
          // 取得直後の描画
          updateGraph(rawHours, days);
        }
        setDisplayInfo(location);
      } catch (error) {
        console.error("[Client] データ取得失敗", error);
      } finally {
        setLoading(false);
      }
    };
    GetWaveData();
  }, [location]); // ★重要：locationが変わるたびに実行される

  //【表示更新用】days または rawWaveData が変わった時にグラフを再構成する
  useEffect(() => {
    if (rawWaveData) {
      console.log("[Client] キャッシュから表示期間を更新:", days, "日間");
      updateGraph(rawWaveData, days);
    }
  }, [days, rawWaveData]);

  //【共通ロジック】データを切り出して State にセットする関数
  const updateGraph = (rawData, displayDays) => {
    const displayData = rawData.slice(0, displayDays * 24);

    windDataRef.current = displayData.map((item) => {
      const deg = item.windDirection?.sg ?? item.windDirection?.noaa ?? null;
      return deg != null ? Math.round(deg) : null;
    });

    setChartData({
      labels: displayData.map((item) =>
        item.time.substring(0, 16).replace("T", " "),
      ),
      datasets: [
        {
          label: "波高 (m)",
          data: displayData.map(
            (item) => item.waveHeight?.sg || item.waveHeight?.noaa || 0,
          ),
          borderColor: "#36A2EB",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          fill: true,
          tension: 0.3,
        },
      ],
    });
  };

  // グラフ描画
  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");

    // 既存のグラフがあれば破棄（二重描画防止）
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // グラフを初期化して描画する
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true },
        },
        layout: { padding: { left: 10, right: 20, top: 10, bottom: 10 } },
        plugins: {
          tooltip: {
            callbacks: {
              afterLabel: (context) => {
                const deg = windDataRef.current[context.dataIndex];
                return deg != null ? `風向: ${degToArrow(deg)} ${degToCompass(deg)} (${deg}°)` : '';
              },
            },
          },
        },
      },
    });
    return () => chartInstance.current?.destroy();
  }, [chartData]);

  // まだ地図がクリックされていない場合
  if (!location || location.lat === 0) {
    return (
      <div className="graph-card">
        <p style={{ textAlign: "center", marginTop: "50px", color: "#666" }}>
          🌊 地図上の地点をクリックして波予報を表示してください
        </p>
        <Link
          to="/Home"
          style={{
            color: "#007bff",
            cursor: "pointer",
            width: "fit-content",
            marginTop: "auto",
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
          }}
        >
          ← 🏠 ホームへ戻る
        </Link>
      </div>
    );
  }

  if (loading) return <div>データを読み込み中...</div>;

  return (
    <>
      <div className="graph-card">
        <h4
          style={{ borderBottom: "2px solid #36A2EB", paddingBottom: "10px" }}
        >
          波高データダッシュボード
          <span
            style={{ fontSize: "0.9rem", color: "#666", marginLeft: "10px" }}
          >
            [{new Date().toLocaleDateString("ja-JP")}]
          </span>
        </h4>
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
              padding: "3px 10px",
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
          style={{
            marginBottom: "10px",
            fontSize: "0.9rem",
            color: "#444",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            📍 測定地点: 緯度 {displayInfo.lat.toFixed(4)} / 経度
            {displayInfo.lng.toFixed(4)}
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              margin: 0,
              padding: "3px 12px",
              cursor: "pointer",
              borderRadius: "20px",
              border: "1px solid #36A2EB",
              background: "white",
              color: "#36A2EB",
              fontSize: "0.8rem",
              whiteSpace: "nowrap",
              lineHeight: "1.4",
              width: "fit-content",
            }}
          >
            ⭐ お気に入り登録
          </button>
        </div>
        <div className="graph-container">
          <canvas ref={chartRef}></canvas>
        </div>
        <p className="hint-text">
          ※地図をクリックするとその地点の波高グラフに更新されます。
        </p>
        {rateLimit && (
          <p className="hint-text">
            本日の残りリクエスト: {rateLimit.remaining} / {rateLimit.limit}
          </p>
        )}
        <Link
          to="/Home"
          style={{
            background: "none",
            border: "none",
            color: "#007bff",
            cursor: "pointer",
            width: "fit-content",
            marginTop: "auto",
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
          }}
        >
          ← 🏠 ホームへ戻る
        </Link>
      </div>
      {/* お気に入り登録モーダル */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              width: "300px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>ポイントを登録</h3>

            <label style={{ fontSize: "0.8rem", color: "#666" }}>
              ポイント名
            </label>
            <input
              type="text"
              value={pointName}
              onChange={(e) => setPointName(e.target.value)}
              placeholder="湘南・鵠沼など"
              style={{
                width: "100%",
                padding: "8px",
                marginBottom: "15px",
                boxSizing: "border-box",
              }}
            />

            <label style={{ fontSize: "0.8rem", color: "#666" }}>座標</label>
            <div
              style={{
                backgroundColor: "#eee",
                padding: "8px",
                fontSize: "0.85rem",
                marginBottom: "20px",
                borderRadius: "4px",
              }}
            >
              {displayInfo.lat.toFixed(4)}, {displayInfo.lng.toFixed(4)}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: "8px 15px",
                  border: "none",
                  background: "#ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveFavorite}
                style={{
                  padding: "8px 15px",
                  border: "none",
                  background: "#36A2EB",
                  color: "white",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WaveChart;
