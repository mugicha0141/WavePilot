import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Login from "./Login";
import Home from "./Home";
import Header from "./Header";
import WaveInfo from "./WaveInfo";
import WaveMap from "./WaveMap";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const navigate = useNavigate();
  const location = useLocation(); // 現在のURLの情報を取得

  useEffect(() => {
    const storedLoggedIn = localStorage.getItem("isLoggedIn");
    if (storedLoggedIn === "true") {
      setIsLoggedIn(true);
      setUsername(localStorage.getItem("username") || "");
    } else {
      // ログインしていない場合、強制的にログイン画面に遷移
      if (location.pathname !== "/") {
        navigate("/", { replace: true }); // replace: trueで履歴を上書き
      }
    }
  }, [location, navigate]);

  const handleLogin = (user) => {
    setIsLoggedIn(true);
    setUsername(user);
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("username", user);
    navigate("/home", { replace: true }); // ここでreplace: trueを追加
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername("");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("username");
    navigate("/", { replace: true }); // ログアウト後に履歴を置き換えてログイン画面へ遷移する
  };

  return (
    <>
      {/* ヘッダーはログイン後、ログイン画面で表示しないようにする */}
      {isLoggedIn && location.pathname !== "/" && (
        <Header username={username} onLogout={handleLogout} />
      )}
      <Routes>
        <Route path="/" element={<Login onLogin={handleLogin} />} />
        <Route
          path="/home"
          element={isLoggedIn ? <Home /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/WaveInfo"
          element={isLoggedIn ? <WaveInfo /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/WaveMap"
          element={isLoggedIn ? <WaveMap /> : <Login onLogin={handleLogin} />}
        />
      </Routes>
    </>
  );
}

export default App;
