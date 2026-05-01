import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Login from "./Login";
import Home from "./Home";
import Header from "./Header";
import FavoritePlaceList from "./FavoritePlaceList";
import FavoritePlaceWaveChart from "./FavoritePlaceWaveChart";
import WaveMap from "./WaveMap";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [username, setUsername] = useState("");
  const navigate = useNavigate();
  const location = useLocation(); // 現在のURLの情報を取得

  useEffect(() => {
    const storedLoggedIn = localStorage.getItem("isLoggedIn");
    const storedUsername = localStorage.getItem("username");
    const storedUserId = localStorage.getItem("userId");

    if (storedLoggedIn === "true") {
      setIsLoggedIn(true);
      setUsername(localStorage.getItem("username") || "");
      setCurrentUser({ id: storedUserId, user_name: storedUsername });
    } else {
      // ログインしていない場合、強制的にログイン画面に遷移
      if (location.pathname !== "/") {
        navigate("/", { replace: true }); // replace: trueで履歴を上書き
      }
    }
  }, [location, navigate]);

  const handleLogin = (userData) => {
    setIsLoggedIn(true);
    setCurrentUser(userData);
    setUsername(userData.user_name);

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("userId", String(userData.id));
    localStorage.setItem("username", userData.user_name);
    navigate("/home", { replace: true });
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
      {isLoggedIn && location.pathname !== "/" && (
        <Header username={username} onLogout={handleLogout} />
      )}
      <Routes>
        <Route path="/" element={<Login onLogin={handleLogin} />} />
        <Route
          path="/Home"
          element={
            isLoggedIn ? (
              <Home currentUser={currentUser} />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/user/:userId/FavoritePlaceList"
          element={
            isLoggedIn ? (
              <FavoritePlaceList currentUser={currentUser} />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/user/:userId/FavoritePlaceList/:placeId/"
          element={
            isLoggedIn ? (
              <FavoritePlaceWaveChart currentUser={currentUser} />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/WaveMap"
          element={
            isLoggedIn ? (
              <WaveMap currentUser={currentUser} />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
      </Routes>
    </>
  );
}

export default App;
