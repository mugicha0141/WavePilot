import React from "react";
import "./Home.css";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();
  return (
    <div className="homeContainer">
      <main className="content">
        <div className="button-grid">
          <button
            className="FavoritePlaceList-button"
            onClick={() => navigate("/FavoritePlaceList")}
          >
            FavoritePlace
          </button>
          <button
            className="WaveMap-button"
            onClick={() => navigate("/WaveMap")}
          >
            WaveMap
          </button>
          <button
            className="button3"
            onClick={() => navigate("/Button3")}
          ></button>
          <button
            className="button4"
            onClick={() => navigate("/Button4")}
          ></button>
        </div>
      </main>
    </div>
  );
};

export default Home;
