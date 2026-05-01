const FetchWaveData = async (lat, lng) => {
  try {
    const response = await fetch(`api/wave-data?lat=${lat}&lng=${lng}`);
    const data = await response.json();
    return { data };
  } catch (error) {
    console.error("[Client] データ取得エラー:", error);
    return null;
  }
};
export default FetchWaveData;
