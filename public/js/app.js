// 文体活动组队系统 - 前端逻辑

const API_BASE = '/api';
let currentUser = null;
let userToken = null;
let selectedAvailabilities = [];
let allUsers = []; // 缓存所有用户用于搜索
let userToDelete = null; // 待删除的用户

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
  // 导航链接
  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = e.target.closest('[data-page]').dataset.page;
      showPage(page);
    });
  });

  // 退出登录
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

// API 请求封装
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(userToken && { 'Authorization': `Bearer ${userToken}` })
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  } catch (error) {
    console.error('API 错误:', error);
    throw error;
  }
}

// 检查登录状态
async function checkAuth() {
  userToken = localStorage.getItem('token');
  
  if (!userToken) {
    showAuthPage();
    return;
  }

  try {
    const data = await apiRequest('/auth/me');
    currentUser = data.user;
    showMainApp();
  } catch (error) {
    localStorage.removeItem('token');
    userToken = null;
    currentUser = null;
    showAuthPage();
  }
}

// 显示认证页面
function showAuthPage() {
  document.getElementById('authPage').classList.remove('d-none');
  document.getElementById('navbar').style.display = 'none';
  document.querySelectorAll('.page-content').forEach(page => {
    page.classList.add('d-none');
  });
}

// 显示主应用
function showMainApp() {
  document.getElementById('authPage').classList.add('d-none');
  document.getElementById('navbar').style.display = 'flex';
  
  // 更新用户信息
  document.getElementById('userInfo').textContent = 
    `${currentUser.name} (${currentUser.isSeed ? '种子选手' : currentUser.role === 'admin' ? '管理员' : '用户'})`;
  
  // 显示管理员链接
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = 'block';
    });
  }
  
  // 默认显示时间申报页面
  showPage('availability');
}

// 切换页面
function showPage(pageName) {
  document.querySelectorAll('.page-content').forEach(page => {
    page.classList.add('d-none');
  });
  
  const page = document.getElementById(`${pageName}Page`);
  if (page) {
    page.classList.remove('d-none');
    
    // 加载对应数据
    switch(pageName) {
      case 'availability':
        loadAvailabilityDates();
        break;
      case 'activities':
        loadActivities();
        break;
      case 'admin':
        loadAdminData();
        break;
    }
  }
}

// 显示/隐藏登录表单
function showLogin() {
  document.getElementById('loginForm').classList.remove('d-none');
  document.getElementById('registerForm').classList.add('d-none');
}

function showRegister() {
  document.getElementById('loginForm').classList.add('d-none');
  document.getElementById('registerForm').classList.remove('d-none');
}

// 处理登录
async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    userToken = data.token;
    currentUser = data.user;
    localStorage.setItem('token', data.token);
    
    showToast('登录成功！', 'success');
    showMainApp();
  } catch (error) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = error.message;
    errorEl.classList.remove('d-none');
  }
}

// 处理注册
async function handleRegister(event) {
  event.preventDefault();
  
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    
    userToken = data.token;
    currentUser = data.user;
    localStorage.setItem('token', data.token);
    
    showToast('注册成功！', 'success');
    showMainApp();
  } catch (error) {
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = error.message;
    errorEl.classList.remove('d-none');
  }
}

// 退出登录
function logout() {
  localStorage.removeItem('token');
  userToken = null;
  currentUser = null;
  showAuthPage();
  showToast('已退出登录', 'info');
}

// 加载日期列表
async function loadAvailabilityDates() {
  try {
    const datesData = await apiRequest('/availability/dates/next14');
    const availData = await apiRequest('/availability');
    
    const existingAvailabilities = {};
    availData.availabilities.forEach(a => {
      const key = `${a.date}-${a.timeSlot}`;
      existingAvailabilities[key] = a;
    });
    
    const tbody = document.getElementById('availabilityBody');
    tbody.innerHTML = '';
    selectedAvailabilities = [];
    
    datesData.dates.forEach(item => {
      const tr = document.createElement('tr');
      
      // 检查已选择的时间段
      const hasAfternoon = existingAvailabilities[`${item.date}-1`];
      const hasEvening = existingAvailabilities[`${item.date}-2`];
      const hasFullDay = existingAvailabilities[`${item.date}-3`];
      
      tr.innerHTML = `
        <td>${item.date}</td>
        <td>${item.dayOfWeek}</td>
        <td class="availability-cell ${hasAfternoon ? 'selected' : ''} ${item.isModifiable ? '' : 'locked'}" 
            data-date="${item.date}" data-slot="1" onclick="toggleAvailability(this)">
          ${hasAfternoon ? '✓' : '下午'}
        </td>
        <td class="availability-cell ${hasEvening ? 'selected' : ''} ${item.isModifiable ? '' : 'locked'}"
            data-date="${item.date}" data-slot="2" onclick="toggleAvailability(this)">
          ${hasEvening ? '✓' : '晚上'}
        </td>
        <td class="availability-cell ${hasFullDay ? 'selected' : ''} ${item.isModifiable ? '' : 'locked'}"
            data-date="${item.date}" data-slot="3" onclick="toggleAvailability(this)">
          ${hasFullDay ? '✓' : '全天'}
        </td>
        <td>
          ${item.isModifiable ? '<span class="badge bg-success">可修改</span>' : '<span class="badge bg-secondary">锁定</span>'}
        </td>
      `;
      
      tbody.appendChild(tr);
      
      // 添加到已选择列表
      if (hasAfternoon) selectedAvailabilities.push({ date: item.date, timeSlot: 1 });
      if (hasEvening) selectedAvailabilities.push({ date: item.date, timeSlot: 2 });
      if (hasFullDay) selectedAvailabilities.push({ date: item.date, timeSlot: 3 });
    });
  } catch (error) {
    showToast('加载日期失败：' + error.message, 'danger');
  }
}

// 切换时间选择
function toggleAvailability(cell) {
  if (cell.classList.contains('locked')) {
    showToast('3 天内的时间不可修改', 'warning');
    return;
  }
  
  const date = cell.dataset.date;
  const slot = parseInt(cell.dataset.slot);
  
  const index = selectedAvailabilities.findIndex(a => a.date === date && a.timeSlot === slot);
  
  if (index >= 0) {
    // 取消选择
    selectedAvailabilities.splice(index, 1);
    cell.classList.remove('selected');
    cell.textContent = slot === 1 ? '下午' : slot === 2 ? '晚上' : '全天';
  } else {
    // 选择
    // 如果选择全天，取消下午和晚上
    if (slot === 3) {
      const afternoonCell = document.querySelector(`[data-date="${date}"][data-slot="1"]`);
      const eveningCell = document.querySelector(`[data-date="${date}"][data-slot="2"]`);
      
      selectedAvailabilities = selectedAvailabilities.filter(
        a => !(a.date === date && (a.timeSlot === 1 || a.timeSlot === 2))
      );
      
      afternoonCell.classList.remove('selected');
      afternoonCell.textContent = '下午';
      eveningCell.classList.remove('selected');
      eveningCell.textContent = '晚上';
    }
    
    // 如果已选全天，选择下午或晚上时要取消全天
    if (slot === 1 || slot === 2) {
      const fullDayIndex = selectedAvailabilities.findIndex(a => a.date === date && a.timeSlot === 3);
      if (fullDayIndex >= 0) {
        selectedAvailabilities.splice(fullDayIndex, 1);
        const fullDayCell = document.querySelector(`[data-date="${date}"][data-slot="3"]`);
        fullDayCell.classList.remove('selected');
        fullDayCell.textContent = '全天';
      }
    }
    
    selectedAvailabilities.push({ date, timeSlot: slot });
    cell.classList.add('selected');
    cell.textContent = '✓';
  }
}

// 提交申报
async function submitAvailability() {
  try {
    await apiRequest('/availability/batch', {
      method: 'POST',
      body: JSON.stringify({ availabilities: selectedAvailabilities })
    });
    
    showToast('申报成功！', 'success');
    loadAvailabilityDates();
  } catch (error) {
    showToast('提交失败：' + error.message, 'danger');
  }
}

// 加载活动
async function loadActivities() {
  try {
    // 我的活动
    const myData = await apiRequest('/team/activities/my');
    const myContainer = document.getElementById('myActivitiesList');
    
    if (myData.activities.length === 0) {
      myContainer.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-calendar-x"></i>
          <p>暂无已加入的活动</p>
          <small>系统组队完成后将在此处显示</small>
        </div>
      `;
    } else {
      myContainer.innerHTML = myData.activities.map(a => `
        <div class="card activity-card ${a.status}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-1">
                  <i class="bi bi-calendar3"></i> ${a.date} 
                  <span class="badge badge-time badge-${getTimeSlotClass(a.timeSlot)}">${a.timeSlotText}</span>
                </h6>
                <small class="text-muted">状态：${getStatusText(a.status)}</small>
              </div>
              <span class="badge bg-${a.status === 'confirmed' ? 'success' : 'secondary'}">
                ${getStatusText(a.status)}
              </span>
            </div>
          </div>
        </div>
      `).join('');
    }
    
    // 所有活动
    const allData = await apiRequest('/team/activities');
    const allContainer = document.getElementById('allActivitiesList');
    
    if (allData.activities.length === 0) {
      allContainer.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-calendar-event"></i>
          <p>暂无活动安排</p>
          <small>管理员执行组队后将显示活动</small>
        </div>
      `;
    } else {
      allContainer.innerHTML = allData.activities.map(a => `
        <div class="card activity-card ${a.status}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <h6 class="mb-1">
                  <i class="bi bi-calendar3"></i> ${a.date} 
                  <span class="badge badge-time badge-${getTimeSlotClass(a.timeSlot)}">${a.timeSlotText}</span>
                </h6>
              </div>
              <span class="badge bg-${a.status === 'confirmed' ? 'success' : 'secondary'}">
                ${getStatusText(a.status)}
              </span>
            </div>
            <div class="d-flex flex-wrap gap-2">
              ${a.members.map(m => `
                <span class="badge bg-${m.isSeed ? 'warning' : 'secondary'}">
                  ${m.isSeed ? '🌱' : ''}${m.name}${m.isSeed ? ' (种子)' : ''}
                </span>
              `).join('')}
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    showToast('加载活动失败：' + error.message, 'danger');
  }
}

// 加载管理数据
async function loadAdminData() {
  if (currentUser.role !== 'admin') {
    showToast('无权限访问', 'danger');
    return;
  }
  
  try {
    // 用户统计
    const statsData = await apiRequest('/team/stats');
    document.getElementById('userStats').innerHTML = `
      <div class="row text-center">
        <div class="col-4">
          <div class="participation-count">${statsData.stats.length}</div>
          <small>总用户数</small>
        </div>
        <div class="col-4">
          <div class="participation-count">${statsData.stats.filter(s => s.isSeed).length}</div>
          <small>种子选手</small>
        </div>
        <div class="col-4">
          <div class="participation-count">${statsData.stats.filter(s => s.role === 'user' && !s.isSeed).length}</div>
          <small>普通用户</small>
        </div>
      </div>
    `;
    
    // 用户列表
    const usersData = await apiRequest('/admin/users');
    allUsers = usersData.users;
    renderUserList(allUsers);
  } catch (error) {
    showToast('加载管理数据失败：' + error.message, 'danger');
  }
}

// 渲染用户列表
function renderUserList(users) {
  const tbody = document.getElementById('adminUserList');
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-inbox" style="font-size: 2rem;"></i>
          <p class="mb-0 mt-2">暂无用户</p>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>
        ${u.name}
        ${u.id === currentUser.id ? '<span class="badge bg-info ms-1">我</span>' : ''}
      </td>
      <td>${u.email}</td>
      <td>${getRoleBadge(u.role)}</td>
      <td>${u.isSeed ? '<span class="badge seed-badge">是</span>' : '<span class="badge bg-secondary">否</span>'}</td>
      <td><small class="text-muted">${formatDateCN(u.createdAt)}</small></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="showEditUserModal(${u.id})" title="编辑用户">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-info" onclick="viewUserAvailability(${u.id})" title="查看申报">
            <i class="bi bi-calendar-check"></i>
          </button>
          ${u.id !== currentUser.id ? `
            <button class="btn btn-outline-danger" onclick="showDeleteConfirm(${u.id})" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          ` : '<span class="badge bg-secondary">-</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

// 搜索过滤用户
function filterUsers() {
  const keyword = document.getElementById('userSearch').value.toLowerCase();
  
  if (!keyword) {
    renderUserList(allUsers);
    return;
  }
  
  const filtered = allUsers.filter(u => 
    u.name.toLowerCase().includes(keyword) ||
    u.email.toLowerCase().includes(keyword)
  );
  
  renderUserList(filtered);
}

// 显示创建用户模态框
function showCreateUserModal() {
  document.getElementById('userModalTitle').textContent = '新建用户';
  document.getElementById('editUserId').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = 'user';
  document.getElementById('userIsSeed').checked = false;
  document.getElementById('passwordRequired').style.display = 'inline';
  
  const modal = new bootstrap.Modal(document.getElementById('userModal'));
  modal.show();
}

// 显示编辑用户模态框
async function showEditUserModal(userId) {
  try {
    const usersData = await apiRequest('/admin/users');
    const user = usersData.users.find(u => u.id === userId);
    
    if (!user) {
      showToast('用户不存在', 'danger');
      return;
    }
    
    document.getElementById('userModalTitle').textContent = '编辑用户';
    document.getElementById('editUserId').value = user.id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userIsSeed').checked = user.isSeed;
    document.getElementById('passwordRequired').style.display = 'none';
    
    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    modal.show();
  } catch (error) {
    showToast('获取用户信息失败：' + error.message, 'danger');
  }
}

// 保存用户（创建或更新）
async function saveUser() {
  const userId = document.getElementById('editUserId').value;
  const name = document.getElementById('userName').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRole').value;
  const isSeed = document.getElementById('userIsSeed').checked;
  
  // 验证
  if (!name || !email) {
    showToast('姓名和邮箱不能为空', 'danger');
    return;
  }
  
  if (!userId && !password) {
    showToast('新建用户必须设置密码', 'danger');
    return;
  }
  
  if (password && password.length < 6) {
    showToast('密码长度至少 6 位', 'danger');
    return;
  }
  
  try {
    const data = {
      name,
      email,
      role,
      isSeed
    };
    
    if (password) {
      data.password = password;
    }
    
    if (userId) {
      // 更新用户
      await apiRequest(`/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('用户更新成功', 'success');
    } else {
      // 创建用户
      await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('用户创建成功', 'success');
    }
    
    // 关闭模态框并刷新列表
    const modalEl = document.getElementById('userModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    
    loadAdminData();
  } catch (error) {
    showToast(error.message.includes('邮箱已被注册') ? '该邮箱已被注册' : '操作失败：' + error.message, 'danger');
  }
}

// 显示删除确认
function showDeleteConfirm(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  userToDelete = userId;
  document.getElementById('deleteUserName').textContent = `${user.name} (${user.email})`;

  const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  modal.show();
}

// 确认删除用户
async function confirmDeleteUser() {
  if (!userToDelete) return;

  try {
    await apiRequest(`/admin/users/${userToDelete}`, {
      method: 'DELETE'
    });

    showToast('用户已删除', 'success');

    // 关闭模态框
    const modalEl = document.getElementById('deleteConfirmModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    userToDelete = null;
    loadAdminData();
  } catch (error) {
    showToast('删除失败：' + error.message, 'danger');
  }
}

// 查看用户申报详情
let currentViewUserId = null;
let currentUserAvailabilities = [];

async function viewUserAvailability(userId) {
  try {
    const data = await apiRequest(`/admin/availabilities/${userId}`);
    currentViewUserId = userId;
    
    document.getElementById('selectedUserName').textContent = 
      `${data.user.name} (${data.user.email}) - 申报详情`;
    document.getElementById('userAvailabilitySection').classList.remove('d-none');
    
    // 加载未来 14 天日期
    const datesData = await apiRequest('/availability/dates/next14');
    
    // 构建已申报时间映射
    const availMap = {};
    data.availabilities.forEach(a => {
      const key = `${a.date}-${a.timeSlot}`;
      availMap[key] = a;
    });
    
    currentUserAvailabilities = [];
    const tbody = document.getElementById('userAvailabilityBody');
    tbody.innerHTML = '';
    
    datesData.dates.forEach(item => {
      const tr = document.createElement('tr');
      
      const hasAfternoon = availMap[`${item.date}-1`];
      const hasEvening = availMap[`${item.date}-2`];
      const hasFullDay = availMap[`${item.date}-3`];
      
      tr.innerHTML = `
        <td>${item.date}</td>
        <td>${item.dayOfWeek}</td>
        <td class="availability-cell ${hasAfternoon ? 'selected' : ''}" 
            data-date="${item.date}" data-slot="1" onclick="toggleUserAvailability(this)">
          ${hasAfternoon ? '✓' : '下午'}
        </td>
        <td class="availability-cell ${hasEvening ? 'selected' : ''}"
            data-date="${item.date}" data-slot="2" onclick="toggleUserAvailability(this)">
          ${hasEvening ? '✓' : '晚上'}
        </td>
        <td class="availability-cell ${hasFullDay ? 'selected' : ''}"
            data-date="${item.date}" data-slot="3" onclick="toggleUserAvailability(this)">
          ${hasFullDay ? '✓' : '全天'}
        </td>
      `;
      
      tbody.appendChild(tr);
      
      // 添加到当前选择列表
      if (hasAfternoon) currentUserAvailabilities.push({ date: item.date, timeSlot: 1 });
      if (hasEvening) currentUserAvailabilities.push({ date: item.date, timeSlot: 2 });
      if (hasFullDay) currentUserAvailabilities.push({ date: item.date, timeSlot: 3 });
    });
    
    // 滚动到详情区域
    document.getElementById('userAvailabilitySection').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showToast('加载申报详情失败：' + error.message, 'danger');
  }
}

// 切换用户申报选择
function toggleUserAvailability(cell) {
  const date = cell.dataset.date;
  const slot = parseInt(cell.dataset.slot);
  
  const index = currentUserAvailabilities.findIndex(a => a.date === date && a.timeSlot === slot);
  
  if (index >= 0) {
    // 取消选择
    currentUserAvailabilities.splice(index, 1);
    cell.classList.remove('selected');
    cell.textContent = slot === 1 ? '下午' : slot === 2 ? '晚上' : '全天';
  } else {
    // 选择
    if (slot === 3) {
      const afternoonCell = document.querySelector(`[data-date="${date}"][data-slot="1"]`);
      const eveningCell = document.querySelector(`[data-date="${date}"][data-slot="2"]`);
      
      currentUserAvailabilities = currentUserAvailabilities.filter(
        a => !(a.date === date && (a.timeSlot === 1 || a.timeSlot === 2))
      );
      
      afternoonCell.classList.remove('selected');
      afternoonCell.textContent = '下午';
      eveningCell.classList.remove('selected');
      eveningCell.textContent = '晚上';
    }
    
    if (slot === 1 || slot === 2) {
      const fullDayIndex = currentUserAvailabilities.findIndex(a => a.date === date && a.timeSlot === 3);
      if (fullDayIndex >= 0) {
        currentUserAvailabilities.splice(fullDayIndex, 1);
        const fullDayCell = document.querySelector(`[data-date="${date}"][data-slot="3"]`);
        fullDayCell.classList.remove('selected');
        fullDayCell.textContent = '全天';
      }
    }
    
    currentUserAvailabilities.push({ date, timeSlot: slot });
    cell.classList.add('selected');
    cell.textContent = '✓';
  }
}

// 关闭申报详情
function closeAvailabilityDetail() {
  document.getElementById('userAvailabilitySection').classList.add('d-none');
  currentViewUserId = null;
  currentUserAvailabilities = [];
}

// 保存用户申报修改
async function saveUserAvailability() {
  if (!currentViewUserId) return;
  
  try {
    await apiRequest(`/admin/availabilities/${currentViewUserId}/batch`, {
      method: 'POST',
      body: JSON.stringify({ availabilities: currentUserAvailabilities })
    });
    
    showToast('申报修改成功', 'success');
    closeAvailabilityDetail();
  } catch (error) {
    showToast('保存失败：' + error.message, 'danger');
  }
}

// 执行自动组队
async function buildTeams() {
  if (!confirm('确定要执行未来 14 天的自动组队吗？')) return;
  
  try {
    const data = await apiRequest('/team/build', { method: 'POST' });
    showToast(`组队完成！创建了 ${data.activities.length} 个活动`, 'success');
    loadAdminData();
  } catch (error) {
    showToast('组队失败：' + error.message, 'danger');
  }
}

// 显示 Toast 通知
function showToast(message, type = 'info') {
  const toastEl = document.getElementById('toast');
  const toastBody = document.getElementById('toastBody');
  
  toastBody.textContent = message;
  toastEl.className = `toast show bg-${type} text-white`;
  
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// 辅助函数
function getTimeSlotClass(slot) {
  return slot === 1 ? 'afternoon' : slot === 2 ? 'evening' : 'fullday';
}

function getStatusText(status) {
  const map = {
    'pending': '待确认',
    'confirmed': '已确认',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return map[status] || status;
}

function getRoleText(role) {
  const map = {
    'admin': '管理员',
    'seed': '种子选手',
    'user': '普通用户'
  };
  return map[role] || role;
}

function getRoleBadge(role) {
  const map = {
    'admin': '<span class="badge bg-danger">管理员</span>',
    'seed': '<span class="badge seed-badge">种子选手</span>',
    'user': '<span class="badge bg-secondary">普通用户</span>'
  };
  return map[role] || `<span class="badge bg-secondary">${role}</span>`;
}

function formatDateCN(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
