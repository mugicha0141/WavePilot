import React from "react";
import { useNavigate } from "react-router-dom";
import "./Header.css";

function Header({ username, onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate("/", { replace: true });
  };

  return (
    <div className="header-container">
      <div className="logo">WavePilot</div>
      <div className="user-container">
        <div className="user-info">
          ユーザ: {username}
          <button onClick={handleLogout} className="logout-button">
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}

export default Header;
