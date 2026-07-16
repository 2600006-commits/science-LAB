/* ============================================================
   Google Apps Script 백엔드 통신 래퍼
   ============================================================
   - GAS_WEB_APP_URL 을 배포한 웹 앱 URL로 반드시 교체하세요.
   - CORS 사전요청(preflight)을 피하기 위해 Content-Type을 text/plain 으로 보냅니다.
*/

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby2U_CkimX9UE19tOxlVQgJzoPX1nNnAG5zB8rcVCTtyUFOHXEYMl2rBWSUcZD6pj3CBQ/exec';

const Session = {
  KEY: 'labinv_session',
  save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },
  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return null; }
  },
  clear() { localStorage.removeItem(this.KEY); },
};

const AdminSession = {
  KEY: 'labinv_admin_session',
  save(token) { sessionStorage.setItem(this.KEY, token); },
  get() { return sessionStorage.getItem(this.KEY); },
  clear() { sessionStorage.removeItem(this.KEY); },
};

async function callApi(action, payload = {}) {
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.indexOf('PUT_YOUR') === 0) {
    throw new Error('아직 백엔드 URL이 설정되지 않았습니다. js/api.js 의 GAS_WEB_APP_URL 을 설정하세요.');
  }
  const session = Session.get();
  const body = Object.assign(
    { action, token: session ? session.token : '', email: session ? session.user.email : '' },
    payload
  );
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('서버 요청에 실패했습니다 (' + res.status + ')');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
  return data;
}

const Api = {
  // 인증
  signup: (d) => callApi('signup', d),
  login: (d) => callApi('login', d),
  adminLogin: (d) => callApi('adminLogin', d),
  adminListUsers: () => callApi('adminListUsers', { adminToken: AdminSession.get() }),
  adminApproveUser: (userId) => callApi('adminApproveUser', { adminToken: AdminSession.get(), userId }),
  adminRejectUser: (userId) => callApi('adminRejectUser', { adminToken: AdminSession.get(), userId }),
  adminUpdateUser: (userId, fields) => callApi('adminUpdateUser', { adminToken: AdminSession.get(), userId, fields }),

  // LAB 관리 - 보관위치
  getLocations: (query, sortBy) => callApi('getLocations', { query, sortBy }),
  addLocation: (mainLocation) => callApi('addLocation', { mainLocation }),
  addSubLocation: (locationId, subLocation) => callApi('addSubLocation', { locationId, subLocation }),
  deleteLocation: (locationId) => callApi('deleteLocation', { locationId }),

  // LAB 관리 - 타입
  getTypes: () => callApi('getTypes'),
  addType: (name, fields) => callApi('addType', { name, fields }),
  deleteType: (typeId) => callApi('deleteType', { typeId }),

  // LAB 관리 - 판매처
  getVendors: () => callApi('getVendors'),
  addVendor: (d) => callApi('addVendor', d),
  updateVendor: (vendorId, fields) => callApi('updateVendor', { vendorId, fields }),
  deleteVendor: (vendorId) => callApi('deleteVendor', { vendorId }),

  // LAB 관리 - 등록자
  getRegistrants: () => callApi('getRegistrants'),
  getItemsByRegistrant: (registrant) => callApi('getItemsByRegistrant', { registrant }),

  // 재고관리
  getItems: (query) => callApi('getItems', { query }),
  addItem: (item) => callApi('addItem', { item }),
  bulkAddItems: (items) => callApi('bulkAddItems', { items }),
  updateItem: (itemId, fields) => callApi('updateItem', { itemId, fields }),
  updateItemStock: (itemId, newQty, changedBy, note) => callApi('updateItemStock', { itemId, newQty, changedBy, note }),
  deleteItem: (itemId) => callApi('deleteItem', { itemId }),
  uploadPhoto: (itemId, base64, filename, mimeType) => callApi('uploadPhoto', { itemId, base64, filename, mimeType }),
  deletePhoto: (itemId) => callApi('deletePhoto', { itemId }),
  getHistory: (itemId) => callApi('getHistory', { itemId }),

  // 구매관리
  addPurchaseRequest: (request) => callApi('addPurchaseRequest', { request }),
  getPurchaseRequests: (status) => callApi('getPurchaseRequests', { status }),
  updatePurchaseStatus: (requestId, newStatus, changedBy) => callApi('updatePurchaseStatus', { requestId, newStatus, changedBy }),
  deletePurchaseRequest: (requestId) => callApi('deletePurchaseRequest', { requestId }),
};

function toast(message, type = '') {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function apiErr(e) {
  toast(e.message || String(e), 'error');
  console.error(e);
}
