import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  useMapEvents,
  Marker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "./WaveMap.css";
import WaveChart from "./WaveChart";

// マーカーのアイコン化けを防ぐ設定（Leafletのデフォルト設定）
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const WaveMap = ({ currentUser }) => {
  const [location, setLocation] = useState(null);
  // マップクリック時のイベントコンポーネント
  function ClickHandler() {
    useMapEvents({
      click(e) {
        // 緯度・経度取得
        const newLat = e.latlng.lat;
        const newLng = e.latlng.lng;

        console.log("[Client] 取得した座標:", newLat, newLng);

        // 状態更新
        setLocation({ lat: newLat, lng: newLng });
      },
    });

    // マーカーの位置も state に連動させる
    return location ? <Marker position={[location.lat, location.lng]} /> : null;
  }

  return (
    <div className="wave-dashboard">
      {/* 左半分：マップ */}
      <div className="map-section">
        <MapContainer
          center={[35.319, 139.546]}
          zoom={11}
          style={{ height: "100%", width: "100%" }} // Leaflet自体は高さ指定が必須
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickHandler />
        </MapContainer>
      </div>

      {/* 右半分：グラフ */}
      <div className="graph-section">
        <WaveChart currentUser={currentUser} location={location} />
      </div>
    </div>
  );
};

export default WaveMap;
