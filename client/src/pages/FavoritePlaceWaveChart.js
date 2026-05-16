import React, { useState, useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";
import { useNavigate, useLocation } from "react-router-dom";
import FetchWaveData from "../utils/FetchWaveData";
import SaveDataCache from "../utils/SaveDataCache";

const FavoritePlaceWaveChart = ({ currentUser }) => {
  const [selectedDays, setSelectedDays] = useState(3);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const { location: coord, name, wave_cache } = routeLocation.state || {};
  const [rawData, setRawData] = useState(wave_cache || null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);

  // rawDataまたはselectedDaysが変わったら表示を更新
  useEffect(() => {
    if (rawData) {
      updateView(rawData, selectedDays);
    }
  }, [rawData, selectedDays]);

  // chartDataが変わったらChart.jsで描画
  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { autoSkip: true, maxTicksLimit: selectedDays === 7 ? 28 : 12 } },
          y: { beginAtZero: true },
        },
        layout: { padding: { left: 10, right: 20, top: 10, bottom: 10 } },
      },
    });

    return () => chartInstance.current?.destroy();
  }, [chartData]);

  // 更新ボタン
  const handleRefresh = async () => {
    if (!coord) return;

    const isConfirmed = window.confirm("最新データに更新しますか？");
    if (!isConfirmed) return;

    setLoading(true);
    try {
      const res = await FetchWaveData(coord.lat, coord.lng);
      if (res && res.data && res.data.hours) {
        const hours = res.data.hours;
        setRawData(hours);
        await SaveDataCache(currentUser.id, coord, hours);
        alert("最新の波情報を取得しました！");
      }
    } catch (error) {
      console.error("更新失敗:", error);
      alert("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 表示切替
  const updateView = (data, days) => {
    if (!data || data.length === 0) return;

    let filtered = data.slice(0, days * 24);

    if (days === 7) {
      filtered = filtered.filter((_, i) => i % 3 === 0);
    }

    const labels = filtered.map((h) => {
      const d = new Date(h.time);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}時`;
    });

    const heights = filtered.map(
      (h) => h.waveHeight?.sg || h.waveHeight?.noaa || 0,
    );

    setChartData({
      labels,
      datasets: [
        {
          label: `波高 (m) - ${days === 7 ? "1週間" : `${days}日間`}`,
          data: heights,
          borderColor: "rgb(75, 192, 192)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          fill: true,
          tension: 0.1,
        },
      ],
    });
  };

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
          disabled={loading}
          style={{
            height: "32px",
            width: "auto",
            padding: "0 12px",
            fontSize: "0.8rem",
            cursor: loading ? "not-allowed" : "pointer",
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
          {loading ? "取得中..." : "更新"}
        </button>
      </div>

      {rawData ? (
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
        >
          <canvas ref={chartRef}></canvas>
        </div>
      ) : (
        <div
          style={{
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f9f9f9",
            borderRadius: "8px",
          }}
        >
          <p style={{ color: "#666" }}>保存されたデータがありません。</p>
        </div>
      )}

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
          ← お気に入りリストに戻る
        </button>
      </div>
    </div>
  );
};

export default FavoritePlaceWaveChart;
