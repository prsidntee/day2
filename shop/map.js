// 마켓 위치: 제주대학교 인문대학 2호관 (OpenStreetMap + Leaflet)
(function () {
  if (typeof L === "undefined") return;
  const POS = [33.4566, 126.5614];
  const map = L.map("map", { scrollWheelZoom: false }).setView(POS, 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.marker(POS).addTo(map).bindPopup("<b>🌴 제주마켓</b><br>제주대학교 인문대학 2호관").openPopup();
})();
