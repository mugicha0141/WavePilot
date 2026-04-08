import React, { useEffect, useRef, useState } from "react";
import { Chart } from "chart.js/auto";

const url =
  "https://marine-api.open-meteo.com/v1/marine?latitude=35.3067999&longitude=139.4858533&current=wave_height,wave_direction,wave_period&hourly=wave_height,wave_direction,wave_period,swell_wave_peak_period&timezone=Asia%2FTokyo";

function WaveInfo() {
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetch(url)
      .then((response) => response.json())
      .then((json) => {
        setChartData({
          labels: json.hourly.time,
          datasets: [
            {
              label: "波の高さ",
              data: json.hourly.wave_height,
              borderColor: "rgb(192,75,75)",
              borderWidth: 2,
              fill: false,
            },
          ],
        });
      })
      .catch((error) => console.error("データ取得エラー:", error));
  }, []);

  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");
    // グラフを初期化して描画する
    const chartInstance = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true },
        },
      },
    });

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    return () => {
      chartInstance.destroy();
    };
  }, [chartData]); // chartDataが変わったときのみ実行

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <canvas id="waveChart" ref={chartRef} width="400" height="400"></canvas>
    </div>
  );
}

export default WaveInfo;
