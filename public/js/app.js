// 文体活动组队系统 - 前端逻辑

const API_BASE = '/api';
let currentUser = null;
let userToken = null;
let selectedAvailabilities = [];
let allUsers = []; // 缓存所有用户用于搜索
let userToDelete = null; // 待删除的用户
let myActivityCodes = []; // 用户的活动代码列表
let currentCodeId = null; // 当前操作的活动代码 ID

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

  // 活动代码选择框变化时，自动加载对应的申报数据
  document.getElementById('activityCodeSelect')?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadAvailabilityDates();
    } else {
      document.getElementById('availabilityBody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">请先选择活动代码</td></tr>';
      selectedAvailabilities = [];
    }
  });
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
    localStorage.setItem('user', JSON.stringify(data.user));
    showMainApp();
  } catch (error) {
    // 只在明确是 401 错误（token 过期或无效）时才清除 token
    if (error.message && error.message.includes('未授权')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      userToken = null;
      currentUser = null;
      showAuthPage();
    } else {
      // 其他错误（如网络问题）保留 token，尝试从 localStorage 恢复用户信息
      console.log('检查登录状态失败，但保留 token:', error.message);
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainApp();
      } else {
        // 如果没有保存的用户信息，清除 token 并显示登录页面
        console.log('无保存的用户信息，请重新登录');
        localStorage.removeItem('token');
        userToken = null;
        currentUser = null;
        showAuthPage();
      }
    }
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

  // 更新用户信息（如果有用户信息）
  if (currentUser) {
    updateUserInfo();

    // 根据角色显示/隐藏管理功能
    const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'activity_admin';

    // 显示管理员链接（只有管理员和活动管理员）
    if (isAdmin) {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'block';
      });
    } else {
      // 普通用户隐藏管理功能
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  // 默认显示时间申报页面
  showPage('availability');
}

// 切换页面
function showPage(pageName) {
  // 检查管理员页面权限（超级管理员和活动管理员）
  if ((pageName === 'admin' || pageName === 'userManagement' || pageName === 'activityManagement') && 
      currentUser.role !== 'super_admin' && currentUser.role !== 'activity_admin') {
    showToast('无权限访问', 'danger');
    return;
  }

  document.querySelectorAll('.page-content').forEach(page => {
    page.classList.add('d-none');
  });

  const page = document.getElementById(`${pageName}Page`);
  if (page) {
    page.classList.remove('d-none');

    // 加载对应数据
    switch(pageName) {
      case 'availability':
        loadMyActivityCodes();
        // loadAvailabilityDates() 会在活动代码加载后自动调用（当选择第一个活动代码时）
        // 或者在用户手动选择活动代码时通过 change 事件触发
        break;
      case 'activities':
        loadActivities();
        break;
      case 'userManagement':
        loadUserManagement();
        break;
      case 'activityManagement':
        loadActivityManagement();
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
  toggleInviteCodeField();
}

// 切换邀请码字段提示
function toggleInviteCodeField() {
  const role = document.getElementById('registerRole').value;
  const hint = document.getElementById('inviteCodeHint');
  
  if (role === 'activity_admin') {
    hint.textContent = '请输入超级管理员发出的邀请码';
  } else {
    hint.textContent = '请输入活动管理员发出的邀请码';
  }
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
    localStorage.setItem('user', JSON.stringify(data.user));

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

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const role = document.getElementById('registerRole').value;
  let inviteCode = document.getElementById('registerInviteCode').value.trim();
  
  // 检查是否有活动邀请码重定向
  const activityInviteCode = localStorage.getItem('activity_invite_code');

  if (!inviteCode && !activityInviteCode) {
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = '邀请码不能为空';
    errorEl.classList.remove('d-none');
    return;
  }
  
  // 优先使用活动邀请码
  if (activityInviteCode) {
    inviteCode = activityInviteCode;
  }

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role, inviteCode })
    });

    userToken = data.token;
    currentUser = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // 清除活动邀请码重定向
    localStorage.removeItem('activity_invite_code');

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

// 加载用户的活动代码
async function loadMyActivityCodes(selectedCode = null) {
  try {
    // 获取当前用户已加入的活动代码
    const myCodesData = await apiRequest('/activity/codes/my');
    myActivityCodes = myCodesData.codes || [];

    const select = document.getElementById('activityCodeSelect');
    const oldValue = select.value;
    select.innerHTML = '<option value="">-- 请选择活动代码 --</option>';

    myActivityCodes.forEach(code => {
      const option = document.createElement('option');
      option.value = code.code;
      option.textContent = `${code.code} - ${code.name}`;
      select.appendChild(option);
    });

    if (myActivityCodes.length === 0) {
      select.innerHTML = '<option value="" disabled>-- 暂无可用活动代码 --</option>';
      showToast('您还没有被分配到任何活动代码，请联系管理员', 'warning');
    } else {
      // 如果有之前选中的值，恢复它；否则选择第一个
      if (selectedCode) {
        select.value = selectedCode;
      } else if (oldValue) {
        select.value = oldValue;
      } else if (myActivityCodes.length > 0) {
        select.value = myActivityCodes[0].code;
        // 自动加载第一个活动代码的申报数据
        setTimeout(() => loadAvailabilityDates(), 100);
      }
    }
  } catch (error) {
    console.error('加载活动代码错误:', error);
    showToast('加载活动代码失败：' + error.message, 'danger');
  }
}

// 加载日期列表（根据选中的活动代码）
async function loadAvailabilityDates() {
  try {
    const activityCode = document.getElementById('activityCodeSelect').value;

    if (!activityCode) {
      document.getElementById('availabilityBody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">请先选择活动代码</td></tr>';
      selectedAvailabilities = [];
      return;
    }

    // 传递活动代码参数到 API
    const datesData = await apiRequest(`/availability/dates/next14?activityCode=${encodeURIComponent(activityCode)}`);

    console.log('[loadAvailabilityDates] API 返回数据:', datesData.dates.length, '天');

    const tbody = document.getElementById('availabilityBody');
    tbody.innerHTML = '';
    selectedAvailabilities = [];

    datesData.dates.forEach(item => {
      const tr = document.createElement('tr');

      const afternoon = item.slots[1];
      const evening = item.slots[2];

      // 检查是否有全天选项（下午连晚上）
      const fullDay = item.slots[3];
      const hasAfternoon = afternoon.exists || fullDay.exists;
      const hasEvening = evening.exists || fullDay.exists;

      console.log(`[loadAvailabilityDates] ${item.date}: 下午=${hasAfternoon ? '✓' : '✗'}, 晚上=${hasEvening ? '✓' : '✗'}`);

      tr.innerHTML = `
        <td>${item.date}</td>
        <td>${item.dayOfWeek}</td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input time-checkbox"
                 data-date="${item.date}" data-slot="1"
                 ${hasAfternoon ? 'checked' : ''}
                 ${afternoon.isLocked || fullDay.isLocked ? 'disabled' : ''}
                 onclick="toggleTimeCheckbox(this)">
          <label class="form-check-label">下午</label>
        </td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input time-checkbox"
                 data-date="${item.date}" data-slot="2"
                 ${hasEvening ? 'checked' : ''}
                 ${evening.isLocked || fullDay.isLocked ? 'disabled' : ''}
                 onclick="toggleTimeCheckbox(this)">
          <label class="form-check-label">晚上</label>
        </td>
        <td>${getStatusBadgeForDay(item)}</td>
      `;

      tbody.appendChild(tr);

      // 添加到已选择列表
      if (hasAfternoon) selectedAvailabilities.push({ date: item.date, timeSlot: 1, isLocked: afternoon.isLocked || fullDay.isLocked });
      if (hasEvening) selectedAvailabilities.push({ date: item.date, timeSlot: 2, isLocked: evening.isLocked || fullDay.isLocked });
    });

    console.log('[loadAvailabilityDates] selectedAvailabilities 数量:', selectedAvailabilities.length);
  } catch (error) {
    console.error('[loadAvailabilityDates] 错误:', error);
    showToast('加载日期失败：' + error.message, 'danger');
  }
}

// 获取状态徽章（简化版）
function getStatusBadgeForDay(item) {
  const slots = [item.slots[1], item.slots[2], item.slots[3]];
  const locked = slots.filter(s => s.isLocked).length;
  const regret = slots.filter(s => s.exists && s.reason === 'regret_period').length;
  
  if (regret > 0) {
    return `<span class="badge bg-success">后悔期</span>`;
  }
  if (locked > 0) {
    return `<span class="badge bg-secondary">已锁定</span>`;
  }
  return `<span class="badge bg-light text-dark">-</span>`;
}

// 切换时间勾选框
function toggleTimeCheckbox(checkbox) {
  const date = checkbox.dataset.date;
  const slot = parseInt(checkbox.dataset.slot);

  console.log('[toggleTimeCheckbox] 点击:', date, 'slot:', slot, 'checked:', checkbox.checked);

  if (checkbox.disabled) {
    showToast('该时间段已锁定，无法修改', 'warning');
    checkbox.checked = !checkbox.checked; // 恢复原状态
    console.log('[toggleTimeCheckbox] 已锁定，恢复状态');
    return;
  }

  const index = selectedAvailabilities.findIndex(a => a.date === date && a.timeSlot === slot);

  if (checkbox.checked) {
    // 勾选
    if (index < 0) {
      selectedAvailabilities.push({ date, timeSlot: slot, isLocked: false });
      console.log('[toggleTimeCheckbox] 添加:', date, slot);
    }
  } else {
    // 取消勾选
    if (index >= 0) {
      selectedAvailabilities.splice(index, 1);
      console.log('[toggleTimeCheckbox] 移除:', date, slot);
    }
  }

  console.log('[toggleTimeCheckbox] 当前 selectedAvailabilities:', selectedAvailabilities);
}

// 提交申报
async function submitAvailability() {
  const activityCode = document.getElementById('activityCodeSelect').value;

  if (!activityCode) {
    showToast('请选择活动代码', 'warning');
    return;
  }

  if (selectedAvailabilities.length === 0) {
    showToast('请选择至少一个时间段', 'warning');
    return;
  }

  console.log('[提交申报] 准备提交:', selectedAvailabilities);
  console.log('[提交申报] 活动代码:', activityCode);

  try {
    // 显示加载状态
    const submitBtn = event?.target;
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> 提交中...';
    }

    const data = await apiRequest('/availability/batch', {
      method: 'POST',
      body: JSON.stringify({
        availabilities: selectedAvailabilities,
        activityCode
      })
    });

    console.log('[提交申报] 返回数据:', data);

    // 构建详细消息
    let msg = data.message || '申报成功';
    const details = [];
    if (data.addedCount > 0) details.push(`添加 ${data.addedCount} 条`);
    if (data.deletedCount > 0) details.push(`删除 ${data.deletedCount} 条`);
    if (details.length > 0) {
      msg = details.join('，');
    }
    if (data.regretPeriodCount) {
      msg += `（${data.regretPeriodCount} 条在后悔期内）`;
    }

    showToast(msg, 'success');

    // 保持当前选中的活动代码，重新加载申报数据
    console.log('[提交申报] 开始刷新数据...');
    await loadAvailabilityDates();
    console.log('[提交申报] 数据刷新完成');

    // 恢复按钮状态
    if (submitBtn && originalText) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  } catch (error) {
    console.error('[提交申报] 错误:', error);
    showToast('提交失败：' + error.message, 'danger');
    // 恢复按钮状态
    const submitBtn = event?.target;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 提交申报';
    }
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
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'activity_admin') {
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
          <div class="participation-count">${statsData.stats.filter(s => s.role === 'user').length}</div>
          <small>普通用户</small>
        </div>
      </div>
    `;

    // 用户列表
    const usersData = await apiRequest('/admin/users');
    allUsers = usersData.users || [];
    
    // 活动管理员只能看到自己管理的用户和自己
    if (currentUser.role === 'activity_admin') {
      allUsers = allUsers.filter(u => 
        u.id === currentUser.id || 
        u.activity_admin_id === currentUser.id ||
        u.role === 'super_admin'
      );
    }
    
    renderUserList(allUsers);
    
    // 加载活动代码（在用户列表之后）
    await loadActivityCodes();
  } catch (error) {
    showToast('加载管理数据失败：' + error.message, 'danger');
  }
}

let managementUsers = [];
let currentUserFilter = 'all';

// 加载人员管理页面
async function loadUserManagement() {
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'activity_admin') {
    showToast('无权限访问', 'danger');
    return;
  }

  try {
    const usersData = await apiRequest('/admin/users');
    managementUsers = usersData.users || [];
    
    // 活动管理员只能看到自己和关联的普通用户
    if (currentUser.role === 'activity_admin') {
      managementUsers = managementUsers.filter(u => 
        u.id === currentUser.id || 
        u.activityAdminId === currentUser.id
      );
    }
    
    renderUserManagementList(managementUsers);
  } catch (error) {
    showToast('加载用户列表失败：' + error.message, 'danger');
  }
}

// 渲染人员管理列表
function renderUserManagementList(users) {
  const tbody = document.getElementById('userManagementList');

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-inbox" style="font-size: 2rem;"></i>
          <p class="mb-0 mt-2">暂无用户</p>
          <small class="text-danger"><i class="bi bi-exclamation-circle"></i> 每个用户都必须有邀请人才能注册</small>
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
      <td>${getInviterInfo(u)}</td>
      <td><small class="text-muted">${formatDateCN(u.createdAt)}</small></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="editUserFromManagement(${u.id})" title="编辑">
            <i class="bi bi-pencil"></i>
          </button>
          ${canDeleteUser(u) ? `
            <button class="btn btn-outline-danger" onclick="deleteUserFromManagement(${u.id})" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          ` : '<span class="badge bg-secondary">-</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

// 获取邀请人信息
function getInviterInfo(user) {
  // 超级管理员和活动管理员（系统创建）
  if (user.role === 'super_admin' || user.role === 'activity_admin') {
    return '<span class="badge bg-secondary"><i class="bi bi-gear"></i> 系统创建</span>';
  }
  
  // 普通用户显示邀请人
  if (user.activityAdminId) {
    // 在用户列表中查找邀请人
    const inviter = managementUsers.find(u => u.id === user.activityAdminId);
    if (inviter) {
      return `<span class="badge bg-primary"><i class="bi bi-person-check"></i> ${inviter.name}</span>`;
    }
    return `<span class="badge bg-primary">ID:${user.activityAdminId}</span>`;
  }
  
  return '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle"></i> 无邀请人</span>';
}

// 判断是否可以删除用户
function canDeleteUser(user) {
  // 超级管理员可以删除普通用户和活动管理员（不能删除自己）
  if (currentUser.role === 'super_admin') {
    return user.id !== currentUser.id;
  }
  // 活动管理员不能删除用户
  return false;
}

// 过滤用户类型
function filterUserType(type) {
  currentUserFilter = type;
  
  // 更新按钮状态
  document.querySelectorAll('.btn-group .btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  filterUserManagementList();
}

// 过滤人员管理列表
function filterUserManagementList() {
  const keyword = document.getElementById('userManagementSearch').value.toLowerCase();
  
  let filtered = managementUsers;
  
  // 按类型过滤
  if (currentUserFilter !== 'all') {
    filtered = filtered.filter(u => u.role === currentUserFilter);
  }
  
  // 按关键词过滤
  if (keyword) {
    filtered = filtered.filter(u => 
      u.name.toLowerCase().includes(keyword) || 
      u.email.toLowerCase().includes(keyword)
    );
  }
  
  renderUserManagementList(filtered);
}

// 从人员管理编辑用户
async function editUserFromManagement(userId) {
  const user = managementUsers.find(u => u.id === userId);
  if (!user) return;
  
  document.getElementById('userModalTitle').textContent = '编辑用户';
  document.getElementById('editUserId').value = user.id;
  document.getElementById('userName').value = user.name;
  document.getElementById('userEmail').value = user.email;
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = user.role;
  document.getElementById('userIsSeed').checked = user.isSeed === 1;
  document.getElementById('passwordRequired').style.display = 'none';
  
  // 活动管理员只能编辑普通用户，不能修改角色
  if (currentUser.role === 'activity_admin') {
    if (user.role !== 'user') {
      document.getElementById('userRole').disabled = true;
    } else {
      document.getElementById('userRole').disabled = false;
    }
  } else {
    // 超级管理员可以修改任何用户角色
    document.getElementById('userRole').disabled = false;
  }
  
  const modal = new bootstrap.Modal(document.getElementById('userModal'));
  modal.show();
}

// 从人员管理创建用户
function showCreateUserModalFromManagement() {
  document.getElementById('userModalTitle').textContent = '新建用户';
  document.getElementById('editUserId').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = 'user';
  document.getElementById('userIsSeed').checked = false;
  document.getElementById('passwordRequired').style.display = 'inline';
  
  // 活动管理员只能创建普通用户
  if (currentUser.role === 'activity_admin') {
    document.getElementById('userRole').value = 'user';
    document.getElementById('userRole').disabled = true;
  } else {
    // 超级管理员可以创建任何角色
    document.getElementById('userRole').disabled = false;
  }
  
  const modal = new bootstrap.Modal(document.getElementById('userModal'));
  modal.show();
}

// 从人员管理删除用户
async function deleteUserFromManagement(userId) {
  const user = managementUsers.find(u => u.id === userId);
  if (!user) return;
  
  if (!confirm(`确定要删除用户 "${user.name}" 吗？此操作不可恢复。`)) return;
  
  try {
    await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
    showToast('用户已删除', 'success');
    loadUserManagement();
  } catch (error) {
    showToast('删除失败：' + error.message, 'danger');
  }
}

// 加载活动管理页面
async function loadActivityManagement() {
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'activity_admin') {
    showToast('无权限访问', 'danger');
    return;
  }

  try {
    const data = await apiRequest('/activity/codes');
    const codes = data.codes || [];

    // 处理用户和种子选手列表（将逗号分隔的字符串转换为数组）
    const processedCodes = codes.map(code => ({
      ...code,
      users: code.users ? code.users.split(',') : [],
      seeds: code.seeds ? code.seeds.split(',') : []
    }));

    const tbody = document.getElementById('activityManagementList');
    tbody.innerHTML = processedCodes.map(code => {
      const totalMembers = code.users.length;
      const hasEnoughUsers = totalMembers >= 4;
      
      return `
      <tr class="${!hasEnoughUsers ? 'table-warning' : ''}">
        <td><strong>${code.code}</strong></td>
        <td>
          <div class="fw-bold">${code.name}</div>
          <small class="text-muted">${code.description || '-'}</small>
        </td>
        <td>
          <div class="mb-2">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-star-fill text-warning me-1"></i>
              <strong>种子选手：</strong>
            </div>
            <div class="ms-4">
              ${code.seeds && code.seeds.length > 0 
                ? code.seeds.map(name => `<span class="badge bg-warning text-dark me-1 mb-1"><i class="bi bi-star-fill"></i> ${name}</span>`).join('')
                : '<span class="text-muted small">未设置</span>'}
            </div>
          </div>
          <div class="mt-2">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-people-fill text-primary me-1"></i>
              <strong>参与用户：</strong>
              <span class="badge bg-primary ms-1">${totalMembers}</span>
              ${!hasEnoughUsers ? '<span class="badge bg-danger ms-1"><i class="bi bi-exclamation-triangle"></i> 不足 4 人</span>' : ''}
            </div>
            <div class="ms-4">
              ${code.users && code.users.length > 0 
                ? code.users.slice(0, 5).map(name => `<span class="badge bg-primary me-1 mb-1">${name}</span>`).join('') + (code.users.length > 5 ? `<span class="text-muted small">等${code.users.length}人</span>` : '')
                : '<span class="text-muted small">暂无用户</span>'}
            </div>
            ${!hasEnoughUsers ? `<small class="text-danger"><i class="bi bi-exclamation-circle"></i> 需要至少 4 个关联用户才能组队</small>` : ''}
          </div>
        </td>
        <td>
          <small>
            <div class="mb-1"><i class="bi bi-people"></i> 最少：${code.min_players}人</div>
            <div class="mb-1"><i class="bi bi-people-fill"></i> 最多：${code.max_players}人</div>
            <div class="mb-1"><i class="bi bi-trophy"></i> 每局：${code.players_per_game}人</div>
            <div class="mb-1">
              ${code.require_seed ? '<span class="badge bg-success">需种子</span>' : '<span class="badge bg-secondary">无需种子</span>'}
            </div>
            <div>
              ${code.seed_required ? '<span class="badge bg-warning text-dark">强制参与</span>' : '<span class="badge bg-light text-dark">可选</span>'}
            </div>
          </small>
        </td>
        <td>
          <small>
            <div class="text-truncate" style="max-width: 100px;" title="${code.creator_name || '未知'}">
              <i class="bi bi-person-circle"></i> ${code.creator_name || '未知'}
            </div>
          </small>
        </td>
        <td><small class="text-muted">${formatDateCN(code.created_at)}</small></td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="showAssignUserModal(${code.id}, '${code.name}')" title="分配用户">
              <i class="bi bi-people"></i>
            </button>
            <button class="btn btn-outline-warning" onclick="showManageSeedsModal(${code.id}, '${code.name}')" title="管理种子">
              <i class="bi bi-star"></i>
            </button>
            <button class="btn btn-outline-info" onclick="showEditRulesModal(${code.id}, '${code.name}')" title="编辑规则">
              <i class="bi bi-sliders"></i>
            </button>
            <button class="btn btn-outline-success" onclick="showActivityInviteModal(${code.id}, '${code.name}')" title="邀请二维码">
              <i class="bi bi-qr-code"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="deleteActivityCode(${code.id})" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `}).join('');

    if (processedCodes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">暂无活动代码</td></tr>';
    }
  } catch (error) {
    showToast('加载活动管理失败：' + error.message, 'danger');
  }
}

// 加载活动代码列表
async function loadActivityCodes() {
  try {
    const data = await apiRequest('/activity/codes');
    const codes = data.codes || [];
    
    const tbody = document.getElementById('activityCodeList');
    tbody.innerHTML = codes.map(code => `
      <tr>
        <td><strong>${code.code}</strong></td>
        <td>${code.name}</td>
        <td>${code.description || '-'}</td>
        <td>
          <small>
            <div>最少：${code.min_players}人</div>
            <div>最多：${code.max_players}人</div>
            <div>每局：${code.players_per_game}人</div>
            <div>${code.require_seed ? '需种子' : '无需种子'}</div>
            <div>${code.seed_required ? '强制参与' : '可选'}</div>
          </small>
        </td>
        <td>
          <span class="badge bg-primary">${code.user_count || 0}用户</span>
          <span class="badge bg-warning text-dark">${code.seed_count || 0}种子</span>
        </td>
        <td><small class="text-muted">${formatDateCN(code.created_at)}</small></td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="showAssignUserModal(${code.id}, '${code.name}')" title="分配用户">
              <i class="bi bi-people"></i>
            </button>
            <button class="btn btn-outline-warning" onclick="showManageSeedsModal(${code.id}, '${code.name}')" title="管理种子">
              <i class="bi bi-star"></i>
            </button>
            <button class="btn btn-outline-info" onclick="showEditRulesModal(${code.id}, '${code.name}')" title="编辑规则">
              <i class="bi bi-sliders"></i>
            </button>
            <button class="btn btn-outline-success" onclick="showActivityInviteModal(${code.id}, '${code.name}')" title="邀请二维码">
              <i class="bi bi-qr-code"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="deleteActivityCode(${code.id})" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (codes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">暂无活动代码</td></tr>';
    }
  } catch (error) {
    showToast('加载活动代码失败：' + error.message, 'danger');
  }
}

// 显示创建活动代码模态框
function showCreateCodeModal() {
  document.getElementById('activityCodeModalTitle').textContent = '创建活动代码';
  document.getElementById('editCodeId').value = '';
  document.getElementById('activityCode').value = '';
  document.getElementById('activityCode').disabled = false;
  document.getElementById('activityName').value = '';
  document.getElementById('activityDescription').value = '';
  document.getElementById('minPlayers').value = 4;
  document.getElementById('maxPlayers').value = 4;
  document.getElementById('playersPerGame').value = 4;
  document.getElementById('requireSeed').checked = true;
  document.getElementById('seedRequired').checked = true;

  const modal = new bootstrap.Modal(document.getElementById('activityCodeModal'));
  modal.show();
}

// 保存活动代码
async function saveActivityCode() {
  const codeId = document.getElementById('editCodeId').value;
  const code = document.getElementById('activityCode').value.trim();
  const name = document.getElementById('activityName').value.trim();
  const description = document.getElementById('activityDescription').value.trim();
  const minPlayers = parseInt(document.getElementById('minPlayers').value) || 4;
  const maxPlayers = parseInt(document.getElementById('maxPlayers').value) || 4;
  const playersPerGame = parseInt(document.getElementById('playersPerGame').value) || 4;
  const requireSeed = document.getElementById('requireSeed').checked;
  const seedRequired = document.getElementById('seedRequired').checked;

  if (!code || !name) {
    showToast('活动代码和名称不能为空', 'danger');
    return;
  }

  try {
    const rules = { minPlayers, maxPlayers, playersPerGame, requireSeed, seedRequired };

    if (codeId) {
      // 更新 - 包含规则
      await apiRequest(`/activity/codes/${codeId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, rules })
      });
      showToast('活动代码更新成功', 'success');
      
      const modalEl = document.getElementById('activityCodeModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      // 刷新列表
      const activityManagementPage = document.getElementById('activityManagementPage');
      if (activityManagementPage && !activityManagementPage.classList.contains('d-none')) {
        await loadActivityManagement();
      } else {
        await loadActivityCodes();
      }
    } else {
      // 创建 - 包含规则
      const result = await apiRequest('/activity/codes', {
        method: 'POST',
        body: JSON.stringify({ code, name, description, rules })
      });
      
      showToast('活动代码创建成功', 'success');
      
      // 关闭创建模态框
      const modalEl = document.getElementById('activityCodeModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      // 刷新列表
      const activityManagementPage = document.getElementById('activityManagementPage');
      if (activityManagementPage && !activityManagementPage.classList.contains('d-none')) {
        await loadActivityManagement();
      } else {
        await loadActivityCodes();
      }
      
      // 自动弹出人员分配对话框，并默认选中创建者
      setTimeout(() => {
        console.log('[DEBUG] 完整返回数据 JSON:', JSON.stringify(result, null, 2));
        const newCode = result.code || { id: null, name: name };
        console.log('[DEBUG] 创建活动代码后返回的数据:', result);
        console.log('[DEBUG] newCode:', newCode);
        console.log('[DEBUG] newCode.id:', newCode.id);
        console.log('[DEBUG] newCode 的 keys:', Object.keys(newCode));
        if (newCode && newCode.id) {
          console.log('[DEBUG] 准备调用 showAssignUserModal:', newCode.id, newCode.name || name);
          showAssignUserModal(newCode.id, newCode.name || name, true);
        } else {
          console.error('[DEBUG] newCode.id 不存在:', newCode);
        }
      }, 500);
    }
  } catch (error) {
    console.error('保存活动代码错误:', error);
    showToast(error.message || '操作失败', 'danger');
  }
}

// 显示分配用户模态框
async function showAssignUserModal(codeId, codeName, selectCreator = false) {
  currentCodeId = codeId;
  document.getElementById('assignCodeName').textContent = codeName;

  try {
    // 加载所有用户
    const usersData = await apiRequest('/activity/users/all');
    const allUsers = usersData.users || [];

    // 加载已分配的用户
    const assignedData = await apiRequest(`/activity/codes/${codeId}/users`);
    const assignedUserIds = new Set((assignedData.users || []).map(u => u.id));
    
    // 加载已分配的种子选手
    const seedsData = await apiRequest(`/activity/codes/${codeId}/seeds`);
    const assignedSeedIds = new Set((seedsData.seeds || []).map(u => u.id));

    // 生成用户复选框（带种子选手选项）
    const container = document.getElementById('userCheckboxes');
    container.innerHTML = allUsers.map(u => {
      // 如果是创建者且 selectCreator 为 true，自动选中
      const isChecked = assignedUserIds.has(u.id) || (selectCreator && u.id === currentUser.id);
      const isSeed = assignedSeedIds.has(u.id);
      
      return `
      <div class="mb-3 p-2 border-bottom">
        <div class="form-check">
          <input class="form-check-input user-checkbox" type="checkbox" value="${u.id}" id="user_${u.id}" ${isChecked ? 'checked' : ''} onchange="toggleUserSeedOption(${u.id}, ${u.isSeed})">
          <label class="form-check-label fw-bold" for="user_${u.id}">
            ${u.name} 
            <small class="text-muted">(${u.email})</small>
            ${u.id === currentUser.id ? '<span class="badge bg-info ms-1">我</span>' : ''}
          </label>
        </div>
        <div class="ms-4 mt-1" id="seed_option_${u.id}" style="display: ${isChecked ? 'block' : 'none'}">
          <div class="form-check">
            <input class="form-check-input seed-checkbox" type="checkbox" value="${u.id}" id="seed_${u.id}" ${isSeed ? 'checked' : ''}>
            <label class="form-check-label text-warning" for="seed_${u.id}">
              <i class="bi bi-star-fill"></i> 设为种子选手
            </label>
          </div>
        </div>
      </div>
    `}).join('');

    const modal = new bootstrap.Modal(document.getElementById('assignUserModal'));
    modal.show();
  } catch (error) {
    console.error('加载用户列表失败:', error);
    showToast('加载用户列表失败：' + error.message, 'danger');
  }
}

// 切换用户种子选手选项显示
function toggleUserSeedOption(userId, isSeed) {
  const userCheckbox = document.getElementById(`user_${userId}`);
  const seedOption = document.getElementById(`seed_option_${userId}`);
  
  if (seedOption) {
    seedOption.style.display = userCheckbox.checked ? 'block' : 'none';
  }
  
  // 如果用户取消勾选，同时取消种子选手勾选
  if (!userCheckbox.checked) {
    const seedCheckbox = document.getElementById(`seed_${userId}`);
    if (seedCheckbox) {
      seedCheckbox.checked = false;
    }
  }
}

// 全选用户
function selectAllUsers() {
  document.querySelectorAll('#userCheckboxes .user-checkbox').forEach(cb => {
    cb.checked = true;
    const userId = cb.value;
    const seedOption = document.getElementById(`seed_option_${userId}`);
    if (seedOption) seedOption.style.display = 'block';
  });
}

// 全不选用户
function deselectAllUsers() {
  document.querySelectorAll('#userCheckboxes .user-checkbox').forEach(cb => {
    cb.checked = false;
    const userId = cb.value;
    const seedOption = document.getElementById(`seed_option_${userId}`);
    if (seedOption) seedOption.style.display = 'none';
    
    // 同时取消种子选手勾选
    const seedCheckbox = document.getElementById(`seed_${userId}`);
    if (seedCheckbox) seedCheckbox.checked = false;
  });
}

// 保存分配的用户
async function saveAssignedUsers() {
  if (!currentCodeId) return;

  // 获取选中的用户
  const userCheckboxes = document.querySelectorAll('#userCheckboxes .user-checkbox:checked');
  const userIds = Array.from(userCheckboxes).map(cb => parseInt(cb.value));
  
  // 获取选中的种子选手（只从已选用户中获取）
  const seedCheckboxes = document.querySelectorAll('#userCheckboxes .seed-checkbox:checked');
  const seedIds = Array.from(seedCheckboxes).map(cb => parseInt(cb.value));

  try {
    // 保存用户分配
    await apiRequest(`/activity/codes/${currentCodeId}/users`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });
    
    // 只有选择了种子选手才发送请求
    if (seedIds.length > 0) {
      await apiRequest(`/activity/codes/${currentCodeId}/seeds`, {
        method: 'POST',
        body: JSON.stringify({ userIds: seedIds })
      });
    }

    showToast('分配成功', 'success');
    const modal = bootstrap.Modal.getInstance(document.getElementById('assignUserModal'));
    modal.hide();
    
    // 刷新列表
    const activityManagementPage = document.getElementById('activityManagementPage');
    if (activityManagementPage && !activityManagementPage.classList.contains('d-none')) {
      await loadActivityManagement();
    } else {
      await loadActivityCodes();
    }
  } catch (error) {
    showToast('分配失败：' + error.message, 'danger');
  }
}

// ========== 种子选手管理 ==========

let currentSeedCodeId = null;

// 显示管理种子选手模态框
async function showManageSeedsModal(codeId, codeName) {
  currentSeedCodeId = codeId;
  document.getElementById('seedCodeName').textContent = codeName;

  try {
    // 加载所有用户
    const usersData = await apiRequest('/activity/users/all');
    const allUsers = usersData.users || [];

    // 加载已分配的种子选手
    const seedsData = await apiRequest(`/activity/codes/${codeId}/seeds`);
    const seedIds = new Set((seedsData.seeds || []).map(s => s.id));

    // 生成复选框
    const container = document.getElementById('seedCheckboxes');
    container.innerHTML = allUsers.map(u => `
      <div class="form-check">
        <input class="form-check-input seed-checkbox" type="checkbox" value="${u.id}" id="seed_${u.id}" ${seedIds.has(u.id) ? 'checked' : ''}>
        <label class="form-check-label" for="seed_${u.id}">
          ${u.name} (${u.email}) ${u.role === 'admin' ? '<span class="badge bg-danger">管理</span>' : ''}
        </label>
      </div>
    `).join('');

    const modal = new bootstrap.Modal(document.getElementById('manageSeedsModal'));
    modal.show();
  } catch (error) {
    console.error('加载种子选手列表失败:', error);
    showToast('加载种子选手列表失败：' + error.message, 'danger');
  }
}

// 保存分配的种子选手
async function saveAssignedSeeds() {
  if (!currentSeedCodeId) return;

  const checkboxes = document.querySelectorAll('.seed-checkbox:checked');
  const userIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  try {
    await apiRequest(`/activity/codes/${currentSeedCodeId}/seeds`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });

    showToast('种子选手分配成功', 'success');
    const modal = bootstrap.Modal.getInstance(document.getElementById('manageSeedsModal'));
    modal.hide();
    loadActivityCodes();
  } catch (error) {
    showToast('分配失败：' + error.message, 'danger');
  }
}

// ========== 编辑活动规则 ==========

let currentRulesCodeId = null;

// 显示编辑规则模态框
async function showEditRulesModal(codeId, codeName) {
  currentRulesCodeId = codeId;
  document.getElementById('rulesCodeName').textContent = codeName;

  try {
    // 从已加载的活动代码列表中获取数据
    const data = await apiRequest('/activity/codes');
    const code = (data.codes || []).find(c => c.id === codeId);
    
    if (!code) {
      throw new Error('活动代码不存在');
    }

    document.getElementById('editMinPlayers').value = code.min_players || 4;
    document.getElementById('editMaxPlayers').value = code.max_players || 4;
    document.getElementById('editRequireSeed').checked = code.require_seed !== 0;
    document.getElementById('editSeedRequired').checked = code.seed_required !== 0;

    const modal = new bootstrap.Modal(document.getElementById('editRulesModal'));
    modal.show();
  } catch (error) {
    console.error('加载活动规则失败:', error);
    showToast('加载活动规则失败：' + error.message, 'danger');
  }
}

// 保存活动规则
async function saveActivityRules() {
  if (!currentRulesCodeId) return;

  const minPlayers = parseInt(document.getElementById('editMinPlayers').value) || 4;
  const maxPlayers = parseInt(document.getElementById('editMaxPlayers').value) || 4;
  const requireSeed = document.getElementById('editRequireSeed').checked;
  const seedRequired = document.getElementById('editSeedRequired').checked;

  try {
    await apiRequest(`/activity/codes/${currentRulesCodeId}`, {
      method: 'PUT',
      body: JSON.stringify({
        rules: { minPlayers, maxPlayers, requireSeed, seedRequired }
      })
    });

    showToast('活动规则更新成功', 'success');
    const modal = bootstrap.Modal.getInstance(document.getElementById('editRulesModal'));
    modal.hide();
    loadActivityCodes();
  } catch (error) {
    console.error('更新活动规则失败:', error);
    showToast('更新失败：' + error.message, 'danger');
  }
}

// 删除活动代码
async function deleteActivityCode(codeId) {
  if (!confirm('确定要删除该活动代码吗？相关的用户分配将被清除。')) return;

  try {
    await apiRequest(`/activity/codes/${codeId}`, { method: 'DELETE' });
    showToast('活动代码已删除', 'success');
    
    // 根据当前页面刷新列表
    const activityManagementPage = document.getElementById('activityManagementPage');
    if (activityManagementPage && !activityManagementPage.classList.contains('d-none')) {
      await loadActivityManagement();
    } else {
      await loadActivityCodes();
    }
  } catch (error) {
    showToast('删除失败：' + error.message, 'danger');
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
          ${u.id !== currentUser.id && currentUser.role === 'super_admin' ? `
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
      isSeed: isSeed ? 1 : 0
    };

    if (password) {
      data.password = password;
    }

    // 活动管理员创建用户时，自动关联到自己
    if (!userId && currentUser.role === 'activity_admin') {
      data.activityAdminId = currentUser.id;
    }
    
    // 超级管理员创建活动管理员时，也关联到自己
    if (!userId && currentUser.role === 'super_admin' && role === 'activity_admin') {
      data.activityAdminId = currentUser.id;
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
      const response = await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      console.log('创建用户响应:', response);
      showToast('用户创建成功', 'success');
    }

    // 关闭模态框并刷新列表
    const modalEl = document.getElementById('userModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // 根据当前页面刷新列表
    const isUserManagementPage = !document.getElementById('userManagementPage').classList.contains('d-none');
    if (isUserManagementPage) {
      loadUserManagement();
    } else {
      loadAdminData();
    }
  } catch (error) {
    console.error('保存用户错误:', error);
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
let currentUserActivityCode = null; // 当前用户的活动代码

async function viewUserAvailability(userId) {
  try {
    const data = await apiRequest(`/admin/availabilities/${userId}`);
    currentViewUserId = userId;

    document.getElementById('selectedUserName').textContent =
      `${data.user.name} (${data.user.email}) - 申报详情`;
    document.getElementById('userAvailabilitySection').classList.remove('d-none');

    // 加载所有活动代码
    await loadAllActivityCodesForAdmin();

    // 获取用户当前分配的活动代码
    const allCodesData = await apiRequest('/activity/codes');
    const allCodes = allCodesData.codes || [];
    
    // 查找用户已分配的活动代码
    let userCode = null;
    for (const code of allCodes) {
      const usersData = await apiRequest(`/activity/codes/${code.id}/users`);
      const users = usersData.users || [];
      if (users.some(u => u.id === userId)) {
        userCode = code.code;
        break;
      }
    }
    
    currentUserActivityCode = userCode;
    document.getElementById('userActivityCodeSelect').value = userCode || '';

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

      const afternoon = item.slots[1];
      const evening = item.slots[2];
      const fullDay = item.slots[3];

      // 检查是否已申报（包括全天）
      const hasAfternoon = availMap[`${item.date}-1`] || availMap[`${item.date}-3`];
      const hasEvening = availMap[`${item.date}-2`] || availMap[`${item.date}-3`];

      tr.innerHTML = `
        <td>${item.date}</td>
        <td>${item.dayOfWeek}</td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input time-checkbox"
                 data-date="${item.date}" data-slot="1"
                 ${hasAfternoon ? 'checked' : ''}
                 onclick="toggleUserCheckbox(this)">
          <label class="form-check-label">下午</label>
        </td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input time-checkbox"
                 data-date="${item.date}" data-slot="2"
                 ${hasEvening ? 'checked' : ''}
                 onclick="toggleUserCheckbox(this)">
          <label class="form-check-label">晚上</label>
        </td>
      `;

      tbody.appendChild(tr);

      // 添加到当前选择列表
      if (hasAfternoon) currentUserAvailabilities.push({ date: item.date, timeSlot: 1 });
      if (hasEvening) currentUserAvailabilities.push({ date: item.date, timeSlot: 2 });
    });

    // 滚动到详情区域
    document.getElementById('userAvailabilitySection').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showToast('加载申报详情失败：' + error.message, 'danger');
  }
}

// 加载所有活动代码（管理员）
async function loadAllActivityCodesForAdmin() {
  try {
    const data = await apiRequest('/activity/codes');
    const codes = data.codes || [];
    
    const select = document.getElementById('userActivityCodeSelect');
    select.innerHTML = '<option value="">-- 请选择活动代码 --</option>';
    
    codes.forEach(code => {
      const option = document.createElement('option');
      option.value = code.code;
      option.textContent = `${code.code} - ${code.name}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('加载活动代码失败:', error);
  }
}

// 切换用户申报勾选框
function toggleUserCheckbox(checkbox) {
  const date = checkbox.dataset.date;
  const slot = parseInt(checkbox.dataset.slot);

  const index = currentUserAvailabilities.findIndex(a => a.date === date && a.timeSlot === slot);

  if (checkbox.checked) {
    // 勾选
    if (index < 0) {
      currentUserAvailabilities.push({ date, timeSlot: slot });
    }
  } else {
    // 取消勾选
    if (index >= 0) {
      currentUserAvailabilities.splice(index, 1);
    }
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

  const activityCode = document.getElementById('userActivityCodeSelect').value;
  
  if (!activityCode) {
    showToast('请选择活动代码', 'warning');
    return;
  }

  try {
    // 首先更新用户的活动代码分配
    const allCodesData = await apiRequest('/activity/codes');
    const allCodes = allCodesData.codes || [];
    
    // 找到当前选择的活动代码 ID
    const selectedCode = allCodes.find(c => c.code === activityCode);
    if (selectedCode) {
      // 先移除用户在所有活动代码中的分配
      for (const code of allCodes) {
        await apiRequest(`/activity/codes/${code.id}/users/${currentViewUserId}`, { 
          method: 'DELETE' 
        }).catch(() => {}); // 忽略错误（可能用户不在该代码中）
      }
      
      // 添加用户到新的活动代码
      await apiRequest(`/activity/codes/${selectedCode.id}/users`, {
        method: 'POST',
        body: JSON.stringify({ userIds: [currentViewUserId] })
      });
    }
    
    // 然后保存申报时间
    await apiRequest(`/admin/availabilities/${currentViewUserId}/batch`, {
      method: 'POST',
      body: JSON.stringify({ 
        availabilities: currentUserAvailabilities,
        activityCode 
      })
    });

    showToast('申报修改成功', 'success');
    closeAvailabilityDetail();
  } catch (error) {
    console.error('保存错误:', error);
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
    'super_admin': '<span class="badge bg-danger">超级管理员</span>',
    'activity_admin': '<span class="badge bg-warning text-dark">活动管理员</span>',
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

// ========== 邀请码管理 ==========

let currentInviteCode = null;

// 显示邀请码模态框
async function showInviteCodeModal() {
  try {
    // 获取当前用户的邀请码
    const userData = await apiRequest('/auth/me');
    const user = userData.user;
    
    if (user.role === 'super_admin' || user.role === 'activity_admin') {
      currentInviteCode = user.inviteCode;
      
      if (currentInviteCode) {
        document.getElementById('currentInviteCode').value = currentInviteCode.code;
        
        // 生成二维码
        document.getElementById('qrcodeContainer').innerHTML = '';
        const registerUrl = `${window.location.origin}?inviteCode=${currentInviteCode.code}&role=${user.role === 'super_admin' ? 'activity_admin' : 'user'}`;
        new QRCode(document.getElementById('qrcodeContainer'), {
          text: registerUrl,
          width: 200,
          height: 200
        });
        
        // 显示使用状态
        const statusText = currentInviteCode.is_used ? '已使用' : '未使用';
        const statusClass = currentInviteCode.is_used ? 'text-danger' : 'text-success';
        document.getElementById('inviteCodeStatus').innerHTML = `<small class="${statusClass}">状态：${statusText}</small>`;
      } else {
        document.getElementById('currentInviteCode').value = '暂无邀请码';
        document.getElementById('qrcodeContainer').innerHTML = '';
        document.getElementById('inviteCodeStatus').innerHTML = '';
      }
      
      const modal = new bootstrap.Modal(document.getElementById('inviteCodeModal'));
      modal.show();
    }
  } catch (error) {
    showToast('获取邀请码失败：' + error.message, 'danger');
  }
}

// 复制邀请码
function copyInviteCode() {
  const codeInput = document.getElementById('currentInviteCode');
  codeInput.select();
  document.execCommand('copy');
  showToast('邀请码已复制到剪贴板', 'success');
}

// 生成新邀请码
async function generateNewInviteCode() {
  try {
    const response = await apiRequest('/auth/invite-code', {
      method: 'POST'
    });
    
    currentInviteCode = response.inviteCode;
    document.getElementById('currentInviteCode').value = currentInviteCode;
    
    // 重新生成二维码
    document.getElementById('qrcodeContainer').innerHTML = '';
    const registerUrl = `${window.location.origin}?inviteCode=${currentInviteCode}&role=activity_admin`;
    new QRCode(document.getElementById('qrcodeContainer'), {
      text: registerUrl,
      width: 200,
      height: 200
    });
    
    showToast('新邀请码已生成', 'success');
  } catch (error) {
    showToast('生成邀请码失败：' + error.message, 'danger');
  }
}

// 检查 URL 参数自动填充邀请码
function checkUrlForInviteCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('inviteCode');
  const role = urlParams.get('role');
  
  if (inviteCode) {
    document.getElementById('registerInviteCode').value = inviteCode;
    if (role) {
      document.getElementById('registerRole').value = role;
      toggleInviteCodeField();
    }
  }
}

// 初始化时检查 URL 参数
const originalDOMContentLoaded = document.addEventListener('DOMContentLoaded', async () => {
  // 先检查是否是邀请页面
  const isInvitePage = await handleInvitePage();
  if (isInvitePage) {
    return; // 邀请页面不需要执行其他初始化
  }
  
  checkAuth();
  setupEventListeners();
  checkUrlForInviteCode();
});

// ========== 个人中心 ==========

let currentUserData = null;

// 显示个人中心
async function showProfileModal() {
  try {
    const userData = await apiRequest('/auth/me');
    currentUserData = userData.user;
    
    document.getElementById('profileEmail').value = currentUserData.email;
    document.getElementById('profileName').value = currentUserData.name;
    document.getElementById('profileRole').value = getRoleText(currentUserData.role);
    
    // 设置头像
    const avatarUrl = currentUserData.avatar || getAvatarFromEmail(currentUserData.email);
    document.getElementById('profileAvatar').src = avatarUrl;
    
    // 清空密码字段
    document.getElementById('profilePassword').value = '';
    document.getElementById('profilePasswordConfirm').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('profileModal'));
    modal.show();
  } catch (error) {
    showToast('获取个人信息失败：' + error.message, 'danger');
  }
}

// 获取角色文本
function getRoleText(role) {
  const map = {
    'super_admin': '超级管理员',
    'activity_admin': '活动管理员',
    'user': '普通用户'
  };
  return map[role] || role;
}

// 从邮箱生成默认头像
function getAvatarFromEmail(email) {
  const hash = email.toLowerCase().trim();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=random&size=120`;
}

// 上传头像
async function uploadAvatar() {
  const fileInput = document.getElementById('avatarInput');
  const file = fileInput.files[0];
  
  if (!file) return;
  
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'warning');
    return;
  }
  
  // 检查文件大小（最大 2MB）
  if (file.size > 2 * 1024 * 1024) {
    showToast('图片大小不能超过 2MB', 'warning');
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const response = await fetch('/api/auth/avatar', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (data.avatarUrl) {
      document.getElementById('profileAvatar').src = data.avatarUrl;
      currentUserData.avatar = data.avatarUrl;
      showToast('头像上传成功', 'success');
    }
  } catch (error) {
    showToast('头像上传失败：' + error.message, 'danger');
  }
}

// 保存个人信息
async function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const password = document.getElementById('profilePassword').value;
  const passwordConfirm = document.getElementById('profilePasswordConfirm').value;
  
  if (!name) {
    showToast('姓名不能为空', 'warning');
    return;
  }
  
  // 验证密码
  if (password) {
    if (password.length < 6) {
      showToast('密码长度至少 6 位', 'warning');
      return;
    }
    
    if (password !== passwordConfirm) {
      showToast('两次输入的密码不一致', 'warning');
      return;
    }
  }
  
  try {
    const data = { name };
    if (password) {
      data.password = password;
    }
    
    await apiRequest('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    showToast('个人信息更新成功', 'success');
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
    modal.hide();
    
    // 更新导航栏用户信息
    currentUser.name = name;
    updateUserInfo();
  } catch (error) {
    showToast('更新失败：' + error.message, 'danger');
  }
}

// 更新导航栏用户信息
function updateUserInfo() {
  const roleText = currentUser.role === 'super_admin' ? '超级管理员'
    : currentUser.role === 'activity_admin' ? '活动管理员'
    : currentUser.isSeed ? '种子选手' : '用户';

  document.getElementById('userInfo').textContent = `${currentUser.name} (${roleText})`;
}

// ========== 活动邀请码管理（活动代码专用） ==========

let currentActivityInviteCodeId = null;
let currentActivityInviteCode = null;

// 显示活动邀请码管理模态框
async function showActivityInviteModal(codeId, codeName) {
  currentActivityInviteCodeId = codeId;
  currentActivityInviteCode = null;
  const titleEl = document.getElementById('activityInviteModalTitle');
  if (titleEl) titleEl.textContent = `活动邀请码管理 - ${codeName}`;
  
  const modal = new bootstrap.Modal(document.getElementById('activityInviteModal'));
  modal.show();
  
  // 加载邀请码列表
  await loadActivityInvites();
}

// 加载活动邀请码列表
async function loadActivityInvites() {
  if (!currentActivityInviteCodeId) return;
  
  try {
    const data = await apiRequest(`/activity/codes/${currentActivityInviteCodeId}/invites`);
    const invites = data.invites || [];
    
    const tbody = document.getElementById('activityInviteList');
    if (invites.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">暂无邀请码，点击上方按钮生成</td></tr>';
      return;
    }
    
    tbody.innerHTML = invites.map(inv => `
      <tr>
        <td><code class="text-primary">${inv.invite_code}</code></td>
        <td>${inv.is_used === 1 ? '<span class="badge bg-secondary">已使用</span>' : '<span class="badge bg-success">未使用</span>'}</td>
        <td><small class="text-muted">${formatDateCN(inv.created_at)}</small></td>
        <td>
          ${inv.is_used === 0 ? `
            <button class="btn btn-sm btn-outline-primary" onclick="selectInvite('${inv.invite_code}')">
              <i class="bi bi-check"></i> 使用
            </button>
          ` : '<span class="badge bg-secondary">-</span>'}
          <button class="btn btn-sm btn-outline-danger" onclick="deleteInvite('${inv.invite_code}')">
            <i class="bi bi-trash"></i> 删除
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('加载邀请码列表失败:', error);
    showToast('加载失败：' + error.message, 'danger');
  }
}

// 生成活动邀请码
async function generateActivityInvite() {
  if (!currentActivityInviteCodeId) return;
  
  try {
    const data = await apiRequest(`/activity/codes/${currentActivityInviteCodeId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ maxUses: 1 })
    });
    
    showToast('邀请码生成成功', 'success');
    await loadActivityInvites();
    
    // 自动选中新生成的邀请码
    if (data.invite && data.invite.code) {
      selectInvite(data.invite.code);
    }
  } catch (error) {
    console.error('生成邀请码失败:', error);
    showToast('生成失败：' + error.message, 'danger');
  }
}

// 选择邀请码（显示二维码）
function selectInvite(code) {
  currentActivityInviteCode = code;
  document.getElementById('inviteUrlInput').value = `${window.location.origin}/invite/${code}`;
  
  // 生成二维码
  const container = document.getElementById('activityQrcodeContainer');
  container.innerHTML = '';
  new QRCode(container, {
    text: `${window.location.origin}/invite/${code}`,
    width: 128,
    height: 128,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  
  showToast('已选择邀请码', 'success');
}

// 复制邀请链接
function copyInviteUrl() {
  const input = document.getElementById('inviteUrlInput');
  input.select();
  document.execCommand('copy');
  showToast('邀请链接已复制', 'success');
}

// 删除邀请码
async function deleteInvite(code) {
  if (!confirm('确定要删除该邀请码吗？')) return;
  
  try {
    await apiRequest(`/activity/invites/${code}`, { method: 'DELETE' });
    showToast('邀请码已删除', 'success');
    
    if (currentActivityInviteCode === code) {
      currentActivityInviteCode = null;
      document.getElementById('activityQrcodeContainer').innerHTML = '';
      document.getElementById('inviteUrlInput').value = '';
    }
    
    await loadActivityInvites();
  } catch (error) {
    showToast('删除失败：' + error.message, 'danger');
  }
}

// ========== 邀请页面（扫码后） ==========

let inviteCodeFromUrl = null;

// 处理邀请页面
async function handleInvitePage() {
  const path = window.location.pathname;
  const match = path.match(/^\/invite\/([A-Z0-9-]+)$/);
  
  if (!match) {
    return false;
  }
  
  inviteCodeFromUrl = match[1];
  document.getElementById('navbar').style.display = 'none';
  document.getElementById('authPage').classList.add('d-none');
  document.querySelectorAll('.page-content').forEach(page => {
    page.classList.add('d-none');
  });
  document.getElementById('invitePage').classList.remove('d-none');
  
  // 验证邀请码
  await verifyInviteCode(inviteCodeFromUrl);
  
  return true;
}

// 验证邀请码
async function verifyInviteCode(code) {
  try {
    const data = await apiRequest(`/activity/invite/${code}/verify`);
    
    document.getElementById('inviteLoading').classList.add('d-none');
    document.getElementById('inviteSuccess').classList.remove('d-none');
    document.getElementById('inviteActivityName').textContent = data.activity.name;
    document.getElementById('inviteActivityInfo').textContent = `活动代码：${data.activity.code} | 创建者：${data.activity.creator}`;
    
    // 检查登录状态
    if (userToken && currentUser) {
      // 已登录，直接加入
      await useInviteCode(code);
    } else {
      // 未登录，显示登录/注册按钮
      document.getElementById('needLogin').classList.remove('d-none');
    }
  } catch (error) {
    document.getElementById('inviteLoading').classList.add('d-none');
    document.getElementById('inviteError').classList.remove('d-none');
    document.getElementById('inviteErrorMessage').textContent = error.message || '邀请码无效或已被使用';
  }
}

// 使用邀请码
async function useInviteCode(code) {
  try {
    const data = await apiRequest(`/activity/invite/${code}/use`, {
      method: 'POST'
    });
    
    document.getElementById('needLogin').classList.add('d-none');
    document.getElementById('joinSuccess').classList.remove('d-none');
  } catch (error) {
    showToast('加入失败：' + error.message, 'danger');
  }
}

// 跳转到登录
function goToLogin() {
  localStorage.setItem('invite_code_redirect', inviteCodeFromUrl);
  // 显示认证页面
  document.getElementById('invitePage').classList.add('d-none');
  document.getElementById('authPage').classList.remove('d-none');
  showLogin();
}

// 跳转到注册
function goToRegister() {
  localStorage.setItem('activity_invite_code', inviteCodeFromUrl);
  // 显示认证页面
  document.getElementById('invitePage').classList.add('d-none');
  document.getElementById('authPage').classList.remove('d-none');
  showRegister();
  // 自动填充邀请码，并隐藏角色选择（只能注册为普通用户）
  setTimeout(() => {
    const roleSelect = document.getElementById('registerRole');
    const inviteCodeField = document.getElementById('inviteCodeField');
    if (roleSelect) {
      roleSelect.value = 'user';
      roleSelect.disabled = true; // 禁用角色选择
      toggleInviteCodeField();
    }
    if (inviteCodeField) {
      inviteCodeField.classList.add('d-none'); // 隐藏邀请码字段
    }
    // 填充活动邀请码到注册表单（隐藏字段）
    const inviteCodeInput = document.getElementById('registerInviteCode');
    if (inviteCodeInput) {
      inviteCodeInput.value = inviteCodeFromUrl;
      inviteCodeInput.parentElement.classList.add('d-none'); // 隐藏输入框
    }
  }, 100);
}
