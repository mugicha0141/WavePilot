import React, { useState, useEffect } from "react";
import "./WaveNotice.css";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "../config";
import authFetch from "../utils/authFetch";

const WaveNotice = ({ currentUser }) => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [linkCode, setLinkCode] = useState(null);
  const [linked, setLinked] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTime, setEditTime] = useState("07:00");
  const [loading, setLoading] = useState(false);

  // ログインユーザーのお気に入りポイント一覧と通知設定をDBから取得する
  const fetchData = async () => {
    const favRes = await authFetch(
      `${API_BASE_URL}/api/favorites/${currentUser.id}`,
    );
    const favData = await favRes.json();
    setFavorites(favData || []);

    const notifRes = await authFetch(`${API_BASE_URL}/api/notifications`);
    const notifData = await notifRes.json();
    if (notifData) {
      setSchedules(notifData.schedules || {});
      setLinkCode(notifData.link_code || null);
      setLinked(!!notifData.line_user_id);
    }
  };

  // 画面表示時・ログインユーザーが変わった時にデータを取得する
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleSave = async (fav) => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fav_id: fav.id,
          notify_time: editTime,
          lat: fav.latitude,
          lng: fav.longitude,
          place_name: fav.point_name,
        }),
      });
      const data = await res.json();
      if (data.link_code) setLinkCode(data.link_code);
      setEditingId(null);
      await fetchData();
    } catch {
      alert("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fav) => {
    if (!window.confirm(`${fav.point_name} の通知を削除しますか？`)) return;
    try {
      await authFetch(`${API_BASE_URL}/api/notifications/${fav.id}`, {
        method: "DELETE",
      });
      await fetchData();
    } catch {
      alert("削除に失敗しました");
    }
  };

  const startEdit = (fav) => {
    const current = schedules[fav.id];
    setEditTime(current?.notify_time || "07:00");
    setEditingId(fav.id);
  };

  return (
    <div style={{ maxWidth: "500px", margin: "0 auto", padding: "20px" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>LINE通知設定</h2>

      {/* スポット一覧 */}
      {favorites.length === 0 ? (
        <p style={{ color: "#888", fontSize: "0.9rem" }}>
          お気に入りポイントがありません
        </p>
      ) : (
        <div style={{ marginBottom: "24px" }}>
          {favorites.map((fav) => {
            const s = schedules[fav.id];
            const isEditing = editingId === fav.id;
            return (
              <div
                key={fav.id}
                style={{
                  padding: "12px",
                  backgroundColor: "#f9f9f9",
                  borderRadius: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>
                      {fav.point_name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: s ? "#36A2EB" : "#888",
                        marginTop: "2px",
                      }}
                    >
                      {s ? `🔔 毎日 ${s.notify_time}` : "🔕 未設定"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() =>
                        isEditing ? setEditingId(null) : startEdit(fav)
                      }
                      style={{
                        padding: "4px 12px",
                        borderRadius: "4px",
                        border: "1px solid #36A2EB",
                        background: "white",
                        color: "#36A2EB",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      {s ? "変更" : "設定"}
                    </button>
                    {s && (
                      <button
                        onClick={() => handleDelete(fav)}
                        style={{
                          padding: "4px 12px",
                          borderRadius: "4px",
                          border: "1px solid #e74c3c",
                          background: "white",
                          color: "#e74c3c",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                        }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="editTimeInput"
                    />
                    <button
                      onClick={() => handleSave(fav)}
                      disabled={loading}
                      className="editBtn"
                      style={{
                        border: "none",
                        background: "#36A2EB",
                        color: "white",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      {loading ? "保存中..." : "保存"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="editBtn"
                      style={{
                        border: "1px solid #aaa",
                        background: "white",
                        color: "#555",
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <hr style={{ marginBottom: "24px", borderColor: "#eee" }} />

      {/* LINE連携 */}
      <div
        style={{
          backgroundColor: "#f9f9f9",
          borderRadius: "8px",
          padding: "16px",
        }}
      >
        <h3 style={{ fontSize: "1rem", marginBottom: "12px" }}>LINE連携</h3>
        {linked ? (
          <p style={{ color: "#36A2EB", fontWeight: "bold" }}>✔ LINE連携済み</p>
        ) : linkCode ? (
          <>
            <p style={{ marginBottom: "8px", fontSize: "0.9rem" }}>
              以下の連携コードをLINE botに送ってください
            </p>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: "bold",
                textAlign: "center",
                letterSpacing: "0.5rem",
                padding: "12px",
                backgroundColor: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                marginBottom: "12px",
              }}
            >
              {linkCode}
            </div>
            <p style={{ fontSize: "0.8rem", color: "#666" }}>
              ※ LINE公式アカウントを友達追加してからコードを送ってください
            </p>
          </>
        ) : (
          <p style={{ fontSize: "0.9rem", color: "#888" }}>
            通知を設定するとLINE連携コードが発行されます
          </p>
        )}
      </div>

      <div style={{ marginTop: "20px", textAlign: "center" }}>
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

export default WaveNotice;
