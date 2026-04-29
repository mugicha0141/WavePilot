import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./FavoritePlaceList.css";

function FavoritePlaceList({ currentUser }) {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ログインしていない場合は処理しない
    if (!currentUser || !currentUser.id) {
      setLoading(false);
      return;
    }

    const fetchFavorites = async () => {
      try {
        // バックエンドのAPIから、ログインユーザーIDに紐づくデータを取得
        const response = await fetch(`/api/favorites/${currentUser.id}`);
        if (!response.ok) throw new Error("データ取得に失敗しました");

        const data = await response.json();
        setFavorites(data);
      } catch (error) {
        console.error("Fetch Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="favorite-container">
        <p>ログイン情報が確認できません。ログインし直してください。</p>
        <button onClick={() => navigate("/")}>ログイン画面へ</button>
      </div>
    );
  }
  //   // 本来は localStorage や DB から取得しますが、まずはテストデータで動作確認します
  //   // 波マップで保存したデータが [{name: "鵠沼", lat: 35.3, lng: 139.4}, ...] という形式と想定
  //   const savedFavorites = JSON.parse(
  //     localStorage.getItem("favoriteWaves"),
  //   ) || [
  //     { id: 1, name: "鵠沼海岸", lat: 35.31, lng: 139.47 },
  //     { id: 2, name: "由比ヶ浜", lat: 35.31, lng: 139.54 },
  //   ];
  //   setFavorites(savedFavorites);
  // }, []);

  // 「波予報を見る」ボタン処理
  const handleOpen = (point) => {
    // 取得したデータのカラム名（point_name, latitude等）に合わせて遷移
    navigate("/FavoritePlaceWaveChart", {
      state: {
        location: { lat: point.latitude, lng: point.longitude },
        name: point.point_name,
      },
    });
  };

  return (
    <div className="favorite-container">
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
        {currentUser
          ? `${currentUser.user_name}さんのお気に入りポイント`
          : "お気に入りポイント"}
      </h2>

      {favorites.length === 0 ? (
        <p style={{ textAlign: "center", color: "#666" }}>
          お気に入りが登録されていません。
        </p>
      ) : (
        <table className="favorite-table">
          <thead>
            <tr>
              <th className="favorite-th">ポイント名</th>
              <th className="favorite-th">座標 (緯度, 経度)</th>
              <th className="favorite-th">アクション</th>
            </tr>
          </thead>
          <tbody>
            {/* map関数で、データの数だけ <tr> を生成する */}
            {favorites.map((point) => (
              <tr key={point.id}>
                <td className="favorite-th">
                  <strong>{point.point_name}</strong>
                </td>
                <td className="favorite-th">
                  <span style={{ color: "#666" }}>
                    {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </span>
                </td>
                <td className="favorite-th">
                  <button
                    className="open-button"
                    onClick={() => handleOpen(point)}
                  >
                    波予報を見る
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "30px", textAlign: "center" }}>
        <button
          onClick={() => navigate("/home")}
          style={{
            background: "none",
            border: "none",
            color: "#007bff",
            cursor: "pointer",
          }}
        >
          ← メニューに戻る
        </button>
      </div>
    </div>
  );
}

export default FavoritePlaceList;
