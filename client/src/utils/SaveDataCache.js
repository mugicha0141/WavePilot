import axios from "axios";
import API_BASE_URL from "../config";

/**
 * 波の生データをデータベースにキャッシュする関数
 * @param {number} userId - ユーザーID
 * @param {object} coord - {lat, lng} 座標
 * @param {object} rawData - APIから取得した生のhoursデータ
 */

const SaveWaveCache = async (userId, coord, rawData) => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_BASE_URL}/api/favorites/cache`, {
      user_id: userId,
      latitude: coord.lat,
      longitude: coord.lng,
      wave_cache: rawData,
      updated_at: new Date().toISOString(),
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("[Client] キャッシュの保存に失敗しました:", error);
    throw error;
  }
};

export default SaveWaveCache;
