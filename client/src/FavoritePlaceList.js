import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./FavoritePlaceList.css";

function FavoritePlaceList({ currentUser }) {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editPointName, setEditPointName] = useState("");

  useEffect(() => {
    if (!currentUser || !currentUser.id) {
      setLoading(false);
      return;
    }

    const fetchFavorites = async () => {
      try {
        const response = await fetch(`/api/favorites/${currentUser.id}`);
        if (!response.ok) throw new Error("データ取得に失敗しました");
        const data = await response.json();
        setFavorites(data);
      } catch (error) {
        console.error("[Client] Fetch Error:", error);
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

  const handleOpen = (point) => {
    if (!currentUser?.id || !point?.id) return;
    navigate(
      `/user/${currentUser.id}/FavoritePlaceList/${point.id}?lat=${point.latitude}&lng=${point.longitude}`,
      {
        state: {
          location: { lat: point.latitude, lng: point.longitude },
          name: point.point_name,
          wave_cache: point.wave_cache,
        },
      },
    );
  };

  const handleUpdate = async () => {
    if (!selectedItem?.id) return;
    try {
      const res = await fetch(`/api/favorites/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_name: editPointName }),
      });
      const result = await res.json();
      if (result.success) {
        setFavorites(
          favorites.map((f) =>
            f.id === selectedItem.id ? { ...f, point_name: editPointName } : f,
          ),
        );
        setSelectedItem((prev) => ({ ...prev, point_name: editPointName }));
        setIsEditModalOpen(false);
      }
    } catch (error) {
      alert("更新に失敗しました");
    }
  };

  const handleDelete = async () => {
    if (!selectedItem?.id) return;
    try {
      const res = await fetch(`/api/favorites/${selectedItem.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFavorites(favorites.filter((f) => f.id !== selectedItem.id));
        setSelectedItem(null);
        setIsDeleteModalOpen(false);
      }
    } catch (error) {
      alert("削除に失敗しました");
    }
  };

  if (loading) return <div className="favorite-container">読み込み中...</div>;

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
        <>
          <table className="favorite-table">
            <thead>
              <tr>
                <th className="favorite-th">ポイント名</th>
                <th className="favorite-th">座標 (緯度, 経度)</th>
              </tr>
            </thead>
            <tbody>
              {favorites.map((point) => (
                <React.Fragment key={point.id}>
                  <tr
                    onClick={() =>
                      setSelectedItem(
                        selectedItem?.id === point.id ? null : point,
                      )
                    }
                    style={{
                      cursor: "pointer",
                      backgroundColor:
                        selectedItem?.id === point.id
                          ? "#e8f4fd"
                          : "transparent",
                      borderLeft:
                        selectedItem?.id === point.id
                          ? "3px solid #36A2EB"
                          : "3px solid transparent",
                      transition: "background-color 0.15s",
                    }}
                  >
                    <td className="favorite-th">
                      <strong>{point.point_name}</strong>
                    </td>
                    <td className="favorite-th">
                      <span style={{ color: "#666" }}>
                        {point.latitude.toFixed(4)},{" "}
                        {point.longitude.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                  {selectedItem?.id === point.id && (
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          padding: "10px 16px",
                          backgroundColor: "#f0f8ff",
                          borderLeft: "3px solid #36A2EB",
                        }}
                      >
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            className="open-button"
                            onClick={() => handleOpen(selectedItem)}
                          >
                            波予報を見る
                          </button>
                          <button
                            className="open-button"
                            onClick={() => {
                              setEditPointName(selectedItem.point_name);
                              setIsEditModalOpen(true);
                            }}
                          >
                            編集
                          </button>
                          <button
                            className="delete-button"
                            onClick={() => setIsDeleteModalOpen(true)}
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: "30px", textAlign: "center" }}>
        <Link
          to="/home"
          style={{
            color: "#007bff",
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
          }}
        >
          ← 🏠 ホームへ戻る
        </Link>
      </div>

      {isEditModalOpen && (
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
            <h3 style={{ marginTop: 0 }}>ポイント名を編集</h3>
            <label style={{ fontSize: "0.8rem", color: "#666" }}>
              新しいポイント名
            </label>
            <input
              type="text"
              value={editPointName}
              onChange={(e) => setEditPointName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                marginBottom: "15px",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setIsEditModalOpen(false)}
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
                onClick={handleUpdate}
                style={{
                  padding: "8px 15px",
                  border: "none",
                  background: "#36A2EB",
                  color: "white",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                更新する
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
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
            <h3 style={{ marginTop: 0 }}>削除の確認</h3>
            <p style={{ fontSize: "0.9rem", color: "#444" }}>
              「{selectedItem?.point_name}」を削除しますか？
            </p>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setIsDeleteModalOpen(false)}
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
                onClick={handleDelete}
                style={{
                  padding: "8px 15px",
                  border: "none",
                  background: "#e74c3c",
                  color: "white",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FavoritePlaceList;
