import React from "react";
import "./Home.css";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();
  return (
    <div className="homeContainer">
      <main className="content">
        <div className="button-grid">
          <button className="wave-button" onClick={() => navigate("/WaveInfo")}>
            波情報
          </button>
          <button className="wave-map" onClick={() => navigate("/WaveMap")}>
            波マップ
          </button>
          <button className="button3" onClick={() => navigate("/Button3")}>
            ボタン3
          </button>
          <button className="button4" onClick={() => navigate("/Button4")}>
            ボタン4
          </button>
        </div>
      </main>
    </div>
  );
};

export default Home;
