const $ = (id) => document.getElementById(id);
const won = (n) => "₩" + Number(n).toLocaleString("ko-KR");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 브라우저마다 고유한 장바구니 번호 (로그인 없이 내 장바구니를 구분)
function getCartId() {
  try {
    let id = localStorage.getItem("cart_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("cart_id", id); }
    return id;
  } catch { return (window.__cid ||= crypto.randomUUID()); }
}
const CART_ID = getCartId();

const GRADIENTS = [
  "linear-gradient(135deg,#ffe3c2,#ffc78f)", "linear-gradient(135deg,#d6f3ee,#aee3d8)",
  "linear-gradient(135deg,#ffe0e6,#ffc2cf)", "linear-gradient(135deg,#e3e7ff,#c3c9f7)",
  "linear-gradient(135deg,#fff3b8,#ffe07a)", "linear-gradient(135deg,#dff5d0,#b7e59a)",
];

// 말차 상품은 이모지 대신 녹색 파베초콜릿 그림(SVG)을 쓴다. 가루가 뿌려진 정사각형 초콜릿 6조각.
function matchaArt() {
  const dust = [[6, 8], [16, 5], [22, 16], [9, 21], [19, 23]];
  let cubes = "";
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = 14 + c * 32, y = 36 + r * 34;
    cubes += `<rect x="${x}" y="${y}" width="28" height="28" rx="7" fill="url(#mcg)"/>` +
      `<rect x="${x}" y="${y}" width="28" height="11" rx="6" fill="#fff" opacity=".2"/>` +
      dust.map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="1.3" fill="#e3f4c6" opacity=".85"/>`).join("");
  }
  return `<svg viewBox="0 0 120 120" role="img" aria-label="말차 파베초콜릿"><defs>
    <linearGradient id="mcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ccc73"/><stop offset="1" stop-color="#4a8532"/></linearGradient></defs>
    <rect x="8" y="26" width="104" height="82" rx="14" fill="#f4f9ea" stroke="#bcd9a0" stroke-width="2"/>${cubes}
    <path d="M96 14c10-2 18 4 20 12-9 3-18-1-20-12z" fill="#5f9a3e"/><path d="M98 15c6 3 12 6 17 10" stroke="#e3f4c6" stroke-width="1.2" fill="none"/></svg>`;
}
const art = (p) => (/말차/.test(p.name) ? matchaArt() : esc(p.emoji));
const wrap = (p) => GRADIENTS[p.id % GRADIENTS.length];

let products = [], cart = { items: [], count: 0, total: 0 }, category = "전체", query = "", searchMode = "name", toastTimer;

/* ---------- 로그인 상태 ---------- */
let token = null, user = null, pendingCheckout = false;
try { token = localStorage.getItem("auth_token"); } catch {}
function setAuth(t, u) {
  token = t; user = u;
  try { t ? localStorage.setItem("auth_token", t) : localStorage.removeItem("auth_token"); } catch {}
  renderAuth();
}

async function api(path, opts = {}) {
  const headers = {};
  if (opts.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  let res;
  try {
    res = await fetch(window.API_BASE + path, { ...opts, headers });
  } catch { throw new Error("서버에 연결할 수 없어요"); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) setAuth(null, null); // 만료된 로그인 정리
    const d = data && data.detail;
    throw new Error(typeof d === "string" ? d : (Array.isArray(d) ? "입력한 내용을 다시 확인해 주세요" : "요청에 실패했어요 (" + res.status + ")"));
  }
  return data;
}

function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), 2400);
}

/* ---------- 상품 ---------- */
function renderChips() {
  const cats = ["전체", ...new Set(products.map((p) => p.category))];
  $("chips").innerHTML = cats.map((c) => `<button class="chip ${c === category ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
}
function renderProducts() {
  const q = query.trim().toLowerCase();
  const hay = (p) => (searchMode === "all" ? `${p.name} ${p.description}` : p.name).toLowerCase();
  const list = products.filter((p) => (category === "전체" || p.category === category) && (!q || hay(p).includes(q)));
  $("grid").innerHTML = list.length ? list.map((p, i) => {
    const stock = p.stock ?? 0, sold = stock <= 0;
    return `
    <article class="card ${sold ? "sold" : ""}" style="animation-delay:${i * 50}ms">
      <div class="thumb" style="--g:${wrap(p)}">${art(p)}${sold ? '<span class="soldout">품절</span>' : ""}</div>
      <div class="body">
        <span class="cat">${esc(p.category)}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <div class="stock ${sold ? "out" : stock <= 5 ? "low" : ""}">${sold ? "품절" : stock <= 5 ? `⚡ ${stock}개 남음` : `남은 수량 ${stock}개`}</div>
        <div class="row"><span class="price">${won(p.price)}</span><button class="add" data-id="${p.id}" ${sold ? "disabled" : ""}>${sold ? "품절" : "담기 +"}</button></div>
      </div>
    </article>`;
  }).join("") : `<div class="empty-note">조건에 맞는 상품이 없어요 🥲</div>`;
}

/* ---------- 장바구니 ---------- */
function renderCart() {
  const badge = $("badge");
  badge.textContent = cart.count;
  $("cnt").textContent = cart.count + "개";
  $("total").textContent = won(cart.total);
  $("order").disabled = cart.count === 0;
  $("clear").style.display = cart.count ? "block" : "none";
  $("lines").innerHTML = cart.items.length ? cart.items.map((it) => `
    <div class="line">
      <div class="em">${art(it.product)}</div>
      <div class="info">
        <div class="nm">${esc(it.product.name)}</div>
        <div class="pr">${won(it.product.price)}</div>
        <div class="step">
          <button data-act="dec" data-id="${it.product.id}" data-q="${it.quantity}" aria-label="하나 빼기">−</button>
          <b>${it.quantity}</b>
          <button data-act="inc" data-id="${it.product.id}" data-q="${it.quantity}" aria-label="하나 더하기" ${it.quantity >= (it.product.stock ?? 99) ? 'disabled title="재고 한도예요"' : ""}>+</button>
        </div>
      </div>
      <div><div class="sub">${won(it.quantity * it.product.price)}</div><button class="del" data-act="del" data-id="${it.product.id}">삭제</button></div>
    </div>`).join("") : `<div class="d-empty"><div class="big">🧺</div><p>장바구니가 비어 있어요.<br>마음에 드는 상품을 담아보세요!</p></div>`;
}
function setCart(c, bump) {
  cart = c; renderCart();
  if (bump) { const b = $("badge"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
}
const openCart = (v) => { $("drawer").classList.toggle("open", v); $("overlay").classList.toggle("open", v); };

async function guard(fn) {
  try { await fn(); } catch (e) { toast("⚠️ " + e.message, true); }
}

// 재고가 바뀌었을 수 있어서(다른 사람의 주문 등) 상품 목록을 다시 불러온다
async function refreshProducts() {
  try { products = await api("/products"); renderProducts(); } catch {}
}

$("grid").addEventListener("click", async (e) => {
  const btn = e.target.closest(".add"); if (!btn || btn.disabled) return;
  try {
    setCart(await api(`/cart/${CART_ID}/items`, { method: "POST", body: JSON.stringify({ product_id: +btn.dataset.id, quantity: 1 }) }), true);
    toast("🛒 장바구니에 담았어요");
  } catch (ex) {
    toast("⚠️ " + ex.message, true);
    refreshProducts();
  }
});
$("lines").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const id = +b.dataset.id, q = +b.dataset.q;
  guard(async () => {
    if (b.dataset.act === "del" || (b.dataset.act === "dec" && q <= 1))
      setCart(await api(`/cart/${CART_ID}/items/${id}`, { method: "DELETE" }));
    else
      setCart(await api(`/cart/${CART_ID}/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity: b.dataset.act === "inc" ? Math.min(99, q + 1) : q - 1 }) }));
  });
});
$("clear").onclick = () => guard(async () => { setCart(await api(`/cart/${CART_ID}`, { method: "DELETE" })); toast("장바구니를 비웠어요"); });
/* ---------- 주문 ---------- */
const openModal = (html) => { $("sheet").innerHTML = html; $("modal").classList.add("open"); };
const closeModal = () => $("modal").classList.remove("open");
$("modal").addEventListener("click", (e) => { if (e.target === $("modal") || e.target.closest("[data-close]")) closeModal(); });
const when = (iso) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function showCheckout() {
  if (!cart.count) return;
  if (!user) { pendingCheckout = true; return showLogin("주문하려면 로그인이 필요해요 🔑"); }
  const saved = user; // 회원 정보로 주문서를 미리 채운다
  openModal(`
    <h2>📝 주문서</h2>
    <p class="lead">받는 분 정보를 입력해 주세요.</p>
    <div class="sum-box">
      ${cart.items.map((i) => `<div><span>${esc(i.product.name)} × ${i.quantity}</span><span>${won(i.quantity * i.product.price)}</span></div>`).join("")}
      <div class="t"><span>총 결제금액</span><span>${won(cart.total)}</span></div>
    </div>
    <form id="orderForm" novalidate>
      <div class="field"><label for="f-name">받는 분 이름</label><input id="f-name" maxlength="30" autocomplete="name" value="${esc(saved.name)}" required></div>
      <div class="field"><label for="f-phone">연락처</label><input id="f-phone" type="tel" maxlength="20" placeholder="010-0000-0000" autocomplete="tel" value="${esc(saved.phone)}" required></div>
      <div class="field"><label for="f-addr">배송 주소</label><input id="f-addr" maxlength="200" autocomplete="street-address" value="${esc(saved.address)}" required></div>
      <div class="field"><label for="f-memo">요청사항 (선택)</label><textarea id="f-memo" maxlength="200" placeholder="문 앞에 놓아주세요"></textarea></div>
      <p class="note">※ 연습용 서비스라 실제 결제나 배송은 이루어지지 않고, 주문 내용만 저장됩니다.</p>
      <div class="form-err" id="formErr"></div>
      <div class="actions"><button type="button" class="btn-line" data-close>취소</button><button class="order" id="submitOrder">${won(cart.total)} 주문하기</button></div>
    </form>`);
  $("orderForm").addEventListener("submit", submitOrder);
  $("f-name").focus();
}

async function submitOrder(e) {
  e.preventDefault();
  const body = { name: $("f-name").value.trim(), phone: $("f-phone").value.trim(), address: $("f-addr").value.trim(), memo: $("f-memo").value.trim() };
  const err = (m) => ($("formErr").textContent = m);
  if (!body.name) return err("받는 분 이름을 입력해 주세요");
  if (!/^[0-9+\-\s]{8,20}$/.test(body.phone)) return err("연락처를 숫자로 입력해 주세요 (예: 010-1234-5678)");
  if (!body.address) return err("배송 주소를 입력해 주세요");
  err(""); const btn = $("submitOrder"); btn.disabled = true; btn.textContent = "주문 처리 중…";
  try {
    const order = await api(`/cart/${CART_ID}/checkout`, { method: "POST", body: JSON.stringify(body) });
    setCart({ items: [], count: 0, total: 0 }); openCart(false); refreshProducts();
    openModal(`<div class="done"><div class="big">🎉</div><h2>주문이 접수되었어요!</h2><span class="no">주문번호 ${order.id}</span>
      <div class="sum-box" style="text-align:left">${order.order_items.map((i) => `<div><span>${esc(i.name)} × ${i.quantity}</span><span>${won(i.quantity * i.price)}</span></div>`).join("")}
      <div class="t"><span>합계</span><span>${won(order.total)}</span></div></div>
      <p class="note">${esc(order.customer_name)}님, ${esc(order.address)}로 보내드릴게요.</p>
      <div class="actions"><button class="order" data-close>계속 쇼핑하기</button></div></div>`);
  } catch (ex) { err("⚠️ " + ex.message); btn.disabled = false; btn.textContent = won(cart.total) + " 주문하기"; refreshProducts(); }
}

async function showOrders() {
  if (!user) { pendingCheckout = false; return showLogin("주문내역을 보려면 로그인이 필요해요 🔑"); }
  openModal(`<h2>📦 주문내역</h2><p class="lead">불러오는 중…</p>`);
  try {
    const list = await api("/orders");
    openModal(`<h2>📦 주문내역</h2><p class="lead">${esc(user.name)}님(${esc(user.username)})의 주문이에요. 어느 기기에서든 로그인하면 볼 수 있어요.</p>` +
      (list.length ? list.map((o) => `<div class="ord"><div class="h"><span>주문번호 ${o.id}</span><span>${won(o.total)}</span></div>
        <div class="st">${esc(o.status)} · ${when(o.created_at)}</div>
        <div class="it">${o.order_items.map((i) => `${esc(i.name)} × ${i.quantity}`).join(", ")}</div></div>`).join("") : `<p class="d-empty">아직 주문한 내역이 없어요.</p>`) +
      `<div class="actions" style="margin-top:12px"><button class="btn-line" data-close style="flex:1">닫기</button></div>`);
  } catch (ex) { openModal(`<h2>📦 주문내역</h2><p class="form-err">⚠️ ${esc(ex.message)}</p><div class="actions"><button class="btn-line" data-close style="flex:1">닫기</button></div>`); }
}
/* ---------- 회원가입 / 로그인 ---------- */
function renderAuth() {
  $("authArea").innerHTML = user
    ? `<span class="who">👤 ${esc(user.name)}님</span><button class="ghost-btn" data-auth="logout">로그아웃</button>`
    : `<button class="ghost-btn" data-auth="login">로그인</button><button class="ghost-btn primary" data-auth="signup">회원가입</button>`;
}
$("authArea").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-auth]")?.dataset.auth;
  if (a === "login") { pendingCheckout = false; showLogin(); }
  else if (a === "signup") { pendingCheckout = false; showSignup(); }
  else if (a === "logout") {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    setAuth(null, null); toast("로그아웃했어요");
  }
});

function field(id, label, extra = "", hint = "") {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${extra} required>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
}
function authDone(res, msg) {
  setAuth(res.token, res.user); toast(msg);
  if (pendingCheckout) { pendingCheckout = false; showCheckout(); } else closeModal();
}

function showLogin(msg) {
  openModal(`<h2>🔑 로그인</h2><p class="lead">${esc(msg || "아이디와 비밀번호를 입력해 주세요.")}</p>
    <form id="loginForm" novalidate>
      ${field("l-user", "아이디", 'maxlength="20" autocomplete="username" autocapitalize="none"')}
      ${field("l-pw", "비밀번호", 'type="password" maxlength="72" autocomplete="current-password"')}
      <div class="form-err" id="formErr"></div>
      <div class="actions"><button type="button" class="btn-line" data-close>취소</button><button class="order" id="authBtn">로그인</button></div>
    </form>
    <div style="text-align:center"><button class="link-btn" id="toSignup">아직 회원이 아니신가요? 회원가입</button></div>`);
  $("toSignup").onclick = showSignup;
  $("l-user").focus();
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("l-user").value.trim(), password = $("l-pw").value;
    if (!username || !password) return ($("formErr").textContent = "아이디와 비밀번호를 입력해 주세요");
    $("authBtn").disabled = true;
    try { authDone(await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }), "로그인했어요 👋"); }
    catch (ex) { $("formErr").textContent = "⚠️ " + ex.message; $("authBtn").disabled = false; }
  });
}

function showSignup() {
  openModal(`<h2>🌴 회원가입</h2><p class="lead">가입하면 주문내역을 언제든 확인할 수 있어요.</p>
    <form id="signupForm" novalidate>
      ${field("s-user", "아이디", 'maxlength="20" autocomplete="username" autocapitalize="none"', "영문 소문자, 숫자, _ 사용 · 3~20자")}
      ${field("s-pw", "비밀번호", 'type="password" maxlength="72" autocomplete="new-password"', "8자 이상")}
      ${field("s-pw2", "비밀번호 확인", 'type="password" maxlength="72" autocomplete="new-password"')}
      ${field("s-name", "이름", 'maxlength="30" autocomplete="name"')}
      ${field("s-phone", "연락처", 'type="tel" maxlength="20" placeholder="010-0000-0000" autocomplete="tel"')}
      ${field("s-addr", "주소", 'maxlength="200" autocomplete="street-address"')}
      <p class="note">※ 연습용 서비스예요. 실제 개인정보 대신 테스트용 값으로 가입해 주세요.</p>
      <div class="form-err" id="formErr"></div>
      <div class="actions"><button type="button" class="btn-line" data-close>취소</button><button class="order" id="authBtn">가입하기</button></div>
    </form>
    <div style="text-align:center"><button class="link-btn" id="toLogin">이미 회원이신가요? 로그인</button></div>`);
  $("toLogin").onclick = () => showLogin();
  $("s-user").focus();
  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = { username: $("s-user").value.trim().toLowerCase(), password: $("s-pw").value, name: $("s-name").value.trim(), phone: $("s-phone").value.trim(), address: $("s-addr").value.trim() };
    const err = (m) => ($("formErr").textContent = m);
    if (!/^[a-z0-9_]{3,20}$/.test(b.username)) return err("아이디는 영문 소문자, 숫자, _ 로 3~20자예요");
    if (b.password.length < 8) return err("비밀번호는 8자 이상이어야 해요");
    if (b.password !== $("s-pw2").value) return err("비밀번호 확인이 일치하지 않아요");
    if (!b.name) return err("이름을 입력해 주세요");
    if (!/^[0-9+\-\s]{8,20}$/.test(b.phone)) return err("연락처를 숫자로 입력해 주세요 (예: 010-1234-5678)");
    if (!b.address) return err("주소를 입력해 주세요");
    err(""); $("authBtn").disabled = true;
    try { authDone(await api("/auth/signup", { method: "POST", body: JSON.stringify(b) }), "가입을 환영해요 🎉"); }
    catch (ex) { err("⚠️ " + ex.message); $("authBtn").disabled = false; }
  });
}

$("order").onclick = showCheckout;
$("openOrders").onclick = showOrders;
$("openCart").onclick = () => openCart(true);
$("closeCart").onclick = $("overlay").onclick = () => openCart(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { openCart(false); $("modal").classList.remove("open"); } });
$("chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { category = c.dataset.c; renderChips(); renderProducts(); } });
$("search").addEventListener("input", (e) => { query = e.target.value; renderProducts(); });

// 검색 범위: 상품명만 / 상품명+설명 (선택은 브라우저에 기억)
function applySearchMode() {
  document.querySelectorAll("#searchMode button").forEach((b) => b.classList.toggle("on", b.dataset.m === searchMode));
  $("search").placeholder = searchMode === "all" ? "상품명·설명으로 검색" : "상품명으로 검색";
}
$("searchMode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-m]"); if (!b) return;
  searchMode = b.dataset.m;
  try { localStorage.setItem("search_mode", searchMode); } catch {}
  applySearchMode(); renderProducts();
});
try { searchMode = localStorage.getItem("search_mode") === "all" ? "all" : "name"; } catch {}
applySearchMode();

/* ---------- 시작 ---------- */
(async function init() {
  $("grid").innerHTML = '<div class="skeleton"></div>'.repeat(4);
  renderCart(); renderAuth();
  if (token) { try { user = await api("/auth/me"); } catch { token = null; } renderAuth(); }
  try {
    [products, cart] = await Promise.all([api("/products"), api(`/cart/${CART_ID}`)]);
    renderChips(); renderProducts(); renderCart();
  } catch (e) {
    $("grid").innerHTML = `<div class="empty-note">😢 ${esc(e.message)}<br><small>Supabase에 장바구니 표를 만들었는지 확인해 주세요.</small></div>`;
  }
})();
