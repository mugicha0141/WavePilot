import React, { useState, useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import FetchWaveData from "./FetchWaveData";
import SaveDataCache from "./utils/SaveDataCache";

const FavoritePlaceWaveChart = ({ currentUser }) => {
  const [selectedDays, setSelectedDays] = useState(2);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const { location: coord, name, wave_cache } = routeLocation.state || {};
  const [chartData, setChartData] = useState(
    wave_cache ? JSON.parse(wave_cache) : null,
  );
  const [loading, setLoading] = useState(false);

  // 更新ボタン
  const handleRefresh = async () => {
    if (!coord) return;

    const isConfirmed = window.confirm("最新データに更新しますか？");
    if (!isConfirmed) {
      return;
    }
    setLoading(true);
    try {
      console.log(`${name} の最新データを取得します...`);
      // 外部の FetchWaveData に座標を渡して最新取得
      const res = await FetchWaveData(coord.lat, coord.lng);
      if (res && res.data && res.data.hours) {
        const rawData = res.data.hours;
        updateView(res.data.hours, selectedDays);
        await SaveDataCache(currentUser.id, coord, rawData);
        alert("最新の波情報を取得しました！");
      }
    } catch (error) {
      console.error("更新失敗:", error);
      alert("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 表示切替(3days or 1 week)
  const updateView = (data, days) => {
    if (!data || data.length === 0) return;
    // 指定日数分切り出し
    let filtered = data.slice(0, days * 24);

    // 1週間（7日）の場合は3時間おきに間引く
    if (days === 7) {
      filtered = filtered.filter((_, i) => i % 3 === 0);
    }

    const labels = filtered.map((h) => {
      const d = new Date(h.time);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}時`;
    });

    const heights = filtered.map(
      (h) => h.waveHeight.noaa || h.waveHeight.sg || 0,
    );

    setChartData({
      labels: labels,
      datasets: [
        {
          label: `波高 (m)' - ${days === 3 ? "3日間" : "1週間"}`,
          data: heights,
          borderColor: "rgb(75, 192, 192)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          fill: true,
          tension: 0.1,
        },
      ],
    });
  };

  console.log(`${name}のグラフを表示します`, coord);

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1000px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: "1.2rem", marginBottom: "15px" }}>
        {name} 波情報予測
      </h2>
      {chartData ? (
        <>
          {/* キャッシュまたは取得済みデータがある場合：グラフを表示 */}
          <div className="graph-container">
            <canvas ref={chartRef}></canvas>
          </div>
        </>
      ) : (
        /* データがない場合：更新ボタンのみを表示 */
        <div className="no-data-placeholder">
          <p>保存されたデータがありません。</p>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "5px",
          marginBottom: "20px",
        }}
      >
        <select
          value={selectedDays}
          onChange={(e) => setSelectedDays(Number(e.target.value))}
          style={{
            height: "32px",
            padding: "0px 8px",
            fontSize: "0.8rem",
            borderRadius: "4px",
            border: "1px solid #ccc",
            boxSizing: "border-box",
            margin: "0",
          }}
        >
          <option value={3}>3日間 (1時間毎)</option>
          <option value={7}>1週間 (3時間毎)</option>
        </select>

        <button
          onClick={handleRefresh}
          style={{
            height: "32px",
            width: "auto",
            padding: "0 12px",
            fontSize: "0.8rem",
            cursor: "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
            boxSizing: "border-box",
            margin: "0",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
            lineHeight: "1",
          }}
        >
          更新
        </button>
      </div>

      <div
        style={{
          position: "relative",
          height: "500px",
          width: "100%",
          backgroundColor: "#f9f9f9",
          borderRadius: "8px",
          padding: "10px",
          boxSizing: "border-box",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      ></div>
      <div style={{ marginTop: "30px", textAlign: "center" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            color: "#007bff",
            cursor: "pointer",
          }}
        >
          ← 戻る
        </button>
      </div>
    </div>
  );
};

export default FavoritePlaceWaveChart;
