import API_BASE_URL from "./config";

const FetchWaveData = async (lat, lng) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/wave-data?lat=${lat}&lng=${lng}`,
    );
    const data = await response.json();
    return { data };
  } catch (error) {
    console.error("[Client] データ取得エラー:", error);
    return null;
  }
};
export default FetchWaveData;
