// 내 컴퓨터(localhost)에서 열면 로컬 FastAPI, 배포된 곳에서는 Railway 주소를 쓴다.
window.API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://localhost:8000"
  : "https://my-api-production-b7bc.up.railway.app";
