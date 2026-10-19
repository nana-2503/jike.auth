import axios from 'axios'

// 后台管理端的主 Axios 实例。所有作者后台、管理员后台、公开配置接口默认走 /api 前缀。
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 用于 fetch 或独立 axios 调用时手动补 Authorization，例如文件下载/大文件上传。
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

api.interceptors.request.use((config) => {
  // 普通作者/管理员后台使用 localStorage.token；代理中心使用下面单独的 agentApi。
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    // 后端统一返回 { code, message, data }，页面拿到的 res 已经是 response.data。
    if (response.data.code !== 0) {
      return Promise.reject(new Error(response.data.message))
    }
    return response.data
  },
  (error) => {
    // 初始化未完成时后端会带 need_setup，直接跳安装向导。
    if (error.response?.data?.need_setup && window.location.pathname !== '/setup') {
      window.location.href = '/setup'
    }
    // 普通后台登录过期时清理作者 token。管理员后台也是同一个 token。
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (error.response?.data?.message) {
      return Promise.reject(new Error(error.response.data.message))
    }
    return Promise.reject(error)
  }
)

// authApi：登录注册、安装向导、验证码、社交登录等无需后台登录态的接口。
export const authApi = {
  getSetupStatus: () => api.get('/setup/status'),
  testSetupDatabase: (data: { type: string; host: string; port: number; user: string; password?: string; dbname: string; sslmode?: string }) =>
    api.post('/setup/test-database', data),
  testSetupRedis: (data: { enable: boolean; host?: string; port?: number; password?: string; db?: number }) =>
    api.post('/setup/test-redis', data),
  setupInit: (data: {
    database: { type: string; host: string; port: number; user: string; password?: string; dbname: string; sslmode?: string }
    redis?: { enable: boolean; host?: string; port?: number; password?: string; db?: number }
    admin?: { username: string; email: string; password: string; nickname?: string }
  }) => api.post('/setup/init', data),
  setupAdmin: (data: { username: string; email: string; password: string; nickname?: string }) =>
    api.post('/setup/admin', data),
  register: (data: { username: string; email: string; password: string; email_code?: string; captcha_id?: string; captcha?: string }) =>
    api.post('/auth/register', data),
  login: (username: string, password: string, captchaId?: string, captcha?: string) =>
    api.post('/auth/login', { username, password, captcha_id: captchaId, captcha }),
  sendRegisterCode: (email: string) =>
    api.post('/auth/send-code', { email }),
  sendResetCode: (email: string) =>
    api.post('/auth/send-reset-code', { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post('/auth/reset-password', { email, code, new_password: newPassword }),
  getCaptcha: () => api.get('/auth/captcha'),
  getLoginStatus: () => api.get('/auth/login-status'),
  getSocialLoginStatus: () => api.get('/config/social-login'),
  getSocialLoginURL: (type: string) => api.get('/auth/social/url', { params: { type } }),
  bindSocialAccount: (data: { bind_token: string; username: string; password: string }) =>
    api.post('/auth/social/bind', data),
  registerAndBindSocial: (data: { bind_token: string; username: string; email: string; password: string; email_code?: string; }) =>
    api.post('/auth/social/register-bind', data),
}

// userApi：作者后台接口。后端对应 main.go 里的 auth := api.Group("") 分组。
export const userApi = {
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data: { nickname?: string }) => api.put('/user/profile', data),
  uploadAvatar: (formData: FormData) => api.post('/user/avatar', formData),
  changePassword: (oldPassword: string, newPassword: string) => 
    api.post('/user/change-password', { old_password: oldPassword, new_password: newPassword }),
  getSocialAccounts: () => api.get('/user/social-accounts'),
  unbindSocialAccount: (type: string) => api.delete(`/user/social-accounts/${type}`),
  getStats: () => api.get('/user/stats'),
  getUserChart: (appId?: number) => api.get('/user/chart', { params: { app_id: appId } }),
  getCardChart: (appId?: number) => api.get('/user/card-chart', { params: { app_id: appId } }),
  getAgentChart: (appId?: number) => api.get('/user/agent-chart', { params: { app_id: appId } }),

  /** 导出作者业务数据（ZIP，JSON 内无数据库 ID，用于迁移自建服） */
  portableExport: async (appCodes?: string) => {
    const token = localStorage.getItem('token')
    const q = appCodes ? `?app_codes=${encodeURIComponent(appCodes)}` : ''
    const res = await fetch(`/api/user/portable-export${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const j = await res.json()
      throw new Error(j.message || '导出失败')
    }
    if (!res.ok) {
      throw new Error('导出失败')
    }
    return res.blob()
  },
  /** 导入便携数据包到当前账号 */
  portableImport: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/user/portable-import', fd)
  },

  // 邮箱配置
  getEmailConfig: () => api.get('/user/email-config'),
  saveEmailConfig: (data: any) => api.post('/user/email-config', data),
  testSendEmail: (toEmail: string) => api.post('/user/email-config/test', { to_email: toEmail }),
  listEmailCodes: (page: number, size: number, params?: { app_id?: number; type?: number; email?: string }) =>
    api.get('/user/email-codes', { params: { page, size, ...params } }),

  listApps: (page: number, size: number) =>
    api.get('/user/apps', { params: { page, size } }),
  createApp: (data: {
    app_name: string; description?: string; login_mode?: number; billing_mode?: number;
    heartbeat?: number; crypto_mode?: string; app_secret?: string; sign_algo?: string; server_sign_algo?: string;
    custom_fields?: { key: string; value: string }[];
    bind_device?: number; channel_mode?: number; reg_mode?: number; reg_limit?: number
  }) => api.post('/user/apps', data),
  updateApp: (id: number, data: {
    app_name?: string; description?: string; login_mode?: number; billing_mode?: number;
    heartbeat?: number; crypto_mode?: string; app_secret?: string; sign_algo?: string; server_sign_algo?: string;
    custom_fields?: { key: string; value: string }[];
    bind_device?: number; channel_mode?: number; reg_mode?: number; reg_limit?: number; sdk_log_enabled?: number
  }) => api.put(`/user/apps/${id}`, data),
  deleteApp: (id: number) => api.delete(`/user/apps/${id}`),
  resetAppSecret: (id: number) => api.post(`/user/apps/${id}/reset-secret`),

  // 应用公告管理
  listAppAnnouncements: (appId: number, page: number, size: number) =>
    api.get('/user/app-announcements', { params: { app_id: appId, page, size } }),
  createAppAnnouncement: (data: any) => api.post('/user/app-announcements', data),
  updateAppAnnouncement: (id: number, data: any) => api.put(`/user/app-announcements/${id}`, data),
  deleteAppAnnouncement: (id: number) => api.delete(`/user/app-announcements/${id}`),

  // 软件用户管理
  listAppUsers: (page: number, size: number, keyword?: string, appId?: string, filter?: string) =>
    api.get('/user/appusers', { params: { page, size, keyword, app_id: appId || undefined, filter: filter || undefined } }),
  listRiskAppUsers: (page: number, size: number, level?: string, keyword?: string) =>
    api.get('/user/appusers/risk', { params: { page, size, level: level || undefined, keyword } }),
  disposeRiskAppUser: (id: number, action: string) => api.post(`/user/appusers/${id}/risk-dispose`, { action }),
  getAppUser: (id: number) => api.get(`/user/appusers/${id}`),
  getAppUserProfile: (id: number) => api.get(`/user/appusers/${id}/profile`),
  createAppUser: (data: any) => api.post('/user/appusers', data),
  updateAppUser: (id: number, data: any) => api.put(`/user/appusers/${id}`, data),
  uploadAppUserAvatar: (id: number, formData: FormData) => api.post(`/user/appusers/${id}/avatar`, formData),
  deleteAppUser: (id: number) => api.delete(`/user/appusers/${id}`),
  resetAppUserInviteCode: (id: number) => api.post(`/user/appusers/${id}/reset-invite-code`),
  batchUpdateAppUserStatus: (ids: number[], status: number) => api.post('/user/appusers/batch-status', { ids, status }),
  batchDeleteAppUsers: (ids: number[]) => api.post('/user/appusers/batch-delete', { ids }),

  // 用户标识数据管理
  listAppUserData: (appUserId: number, page: number, size: number) =>
    api.get(`/user/appusers/${appUserId}/data`, { params: { page, size } }),
  createAppUserData: (appUserId: number, data: { key: string; value: string; remark?: string; expire_at?: string }) =>
    api.post(`/user/appusers/${appUserId}/data`, data),
  updateAppUserData: (appUserId: number, dataId: number, data: { key?: string; value?: string; remark?: string; expire_at?: string }) =>
    api.put(`/user/appusers/${appUserId}/data/${dataId}`, data),
  deleteAppUserData: (appUserId: number, dataId: number) =>
    api.delete(`/user/appusers/${appUserId}/data/${dataId}`),

  // 用户特征码管理
  listAppUserDevices: (appUserId: number, page: number, size: number) =>
    api.get(`/user/appusers/${appUserId}/devices`, { params: { page, size } }),
  deleteAppUserDevice: (appUserId: number, deviceId: number) =>
    api.delete(`/user/appusers/${appUserId}/devices/${deviceId}`),

  // 用户操作日志
  listAppUserLogs: (appUserId: number, page: number, size: number, action?: string) =>
    api.get(`/user/appusers/${appUserId}/logs`, { params: { page, size, action: action || undefined } }),
  clearAppUserLogs: (appUserId: number) =>
    api.delete(`/user/appusers/${appUserId}/logs`),

  // 卡种管理
  listCardTypes: (appId: number | null, page: number, size: number) =>
    api.get('/user/cardtypes', { params: { app_id: appId || undefined, page, size } }),
  listCardStockWarnings: (appId?: number) => api.get('/user/cardtypes/stock-warnings', { params: { app_id: appId } }),
  getCardType: (id: number) => api.get(`/user/cardtypes/${id}`),
  createCardType: (data: any) => api.post('/user/cardtypes', data),
  updateCardType: (id: number, data: any) => api.put(`/user/cardtypes/${id}`, data),
  deleteCardType: (id: number) => api.delete(`/user/cardtypes/${id}`),

  // 卡号管理
  generateCards: (data: { card_type_id: number; count: number; remark?: string }) =>
    api.post('/user/cards/generate', data),
  listCards: (appId: number | null, page: number, size: number, params?: { card_type_id?: number; batch_no?: string; status?: number; keyword?: string }) =>
    api.get('/user/cards', { params: { app_id: appId || undefined, page, size, ...params } }),
  updateCardStatus: (id: number, status: number) => api.put(`/user/cards/${id}/status`, { status }),
  deleteCard: (id: number) => api.delete(`/user/cards/${id}`),
  getCardUsage: (id: number) => api.get(`/user/cards/${id}/usage`),
  listCardBatches: (appId: number) => api.get('/user/cards/batches', { params: { app_id: appId } }),
  updateCardsByBatchStatus: (appId: number, batchNo: string, status: number) => api.post('/user/cards/batches/status', { app_id: appId, batch_no: batchNo, status }),
  deleteCardsByBatch: (appId: number, batchNo: string) => api.post('/user/cards/batch-delete', { app_id: appId, batch_no: batchNo }),
  exportCardsByBatch: (appId: number, batchNo: string, status?: number) => api.get('/user/cards/export', { params: { app_id: appId, batch_no: batchNo, status } }),
  exportCardsExcel: (params: { app_id?: number; card_type_id?: number; batch_no?: string; status?: number }) =>
    `/api/user/cards/export-excel?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()}`,
  batchDeleteCards: (ids: number[]) => api.post('/user/cards/batch-delete-ids', { ids }),
  batchUpdateCardStatus: (ids: number[], status: number) => api.post('/user/cards/batch-status', { ids, status }),

  // 版本管理
  listAppVersions: (appId: number | null, page: number, size: number) =>
    api.get('/user/versions', { params: { app_id: appId || undefined, page, size } }),
  getAppVersion: (id: number) => api.get(`/user/versions/${id}`),
  createAppVersion: (data: any) => api.post('/user/versions', data),
  updateAppVersion: (id: number, data: any) => api.put(`/user/versions/${id}`, data),
  deleteAppVersion: (id: number) => api.delete(`/user/versions/${id}`),

  // 通知中心
  listNotifications: (page: number, size: number, read?: string) => api.get('/user/notifications', { params: { page, size, read } }),
  markNotificationRead: (id: number) => api.post(`/user/notifications/${id}/read`),
  markAllNotificationsRead: () => api.post('/user/notifications/read-all'),
  clearNotifications: () => api.delete('/user/notifications'),
  deleteNotification: (id: number) => api.delete(`/user/notifications/${id}`),

  // 数据报表
  getReportOverview: (appId?: number) => api.get('/user/reports/overview', { params: { app_id: appId } }),
  getReportTrend: (days: number, appId?: number) => api.get('/user/reports/trend', { params: { days, app_id: appId } }),
  getVersionStats: (appId?: number) => api.get('/user/reports/versions', { params: { app_id: appId } }),

  // 客户端异常日志
  listClientErrors: (page: number, size: number, params?: { app_id?: number; severity?: string; keyword?: string }) =>
    api.get('/user/client-errors', { params: { page, size, ...params } }),
  deleteClientError: (id: number) => api.delete(`/user/client-errors/${id}`),
  clearClientErrors: (appId?: number) => api.delete('/user/client-errors', { params: { app_id: appId } }),

  // 在线管理
  listOnlineSessions: (appId: number | null, page: number, size: number, keyword?: string, appUserId?: number) =>
    api.get('/user/online', { params: { app_id: appId || undefined, page, size, keyword, app_user_id: appUserId } }),
  getOnlineStats: (appId: number | null) => api.get('/user/online/stats', { params: { app_id: appId || undefined } }),
  getOnlineChart: (appId?: number) => api.get('/user/online/chart', { params: { app_id: appId } }),
  kickOnlineSession: (id: number) => api.delete(`/user/online/${id}`),
  kickOnlineSessionsByUser: (appId: number, appUserId: number) =>
    api.post('/user/online/kick-user', { app_id: appId, app_user_id: appUserId }),

  // WebSocket连接管理
  listWSConnections: () => api.get('/user/ws-connections'),
  kickWSConnection: (token: string) => api.post('/user/ws-connections/kick', { token }),

  // 代理管理
  listAgents: (appId: number | null, page: number, size: number, keyword?: string) =>
    api.get('/user/agents', { params: { app_id: appId || undefined, page, size, keyword } }),
  getAgent: (id: number) => api.get(`/user/agents/${id}`),
  createAgent: (data: any) => api.post('/user/agents', data),
  updateAgent: (id: number, data: any) => api.put(`/user/agents/${id}`, data),
  deleteAgent: (id: number) => api.delete(`/user/agents/${id}`),
  rechargeAgent: (id: number, amount: number) => api.post(`/user/agents/${id}/recharge`, { amount }),
  getAgentDailyStats: (id: number, days = 30) => api.get(`/user/agents/${id}/daily-stats`, { params: { days } }),
  getAgentDailyLogs: (id: number, date: string) => api.get(`/user/agents/${id}/daily-logs`, { params: { date } }),
  listAgentCardTypes: (agentId: number) => api.get(`/user/agents/${agentId}/cardtypes`),
  setAgentCardTypes: (agentId: number, cardTypes: { card_type_id: number; price: number }[]) =>
    api.post(`/user/agents/${agentId}/cardtypes`, { card_types: cardTypes }),

  // 数据池管理
  listDataPools: (appId: number | null, page: number, size: number) =>
    api.get('/user/datapools', { params: { app_id: appId || undefined, page, size } }),
  getDataPool: (id: number) => api.get(`/user/datapools/${id}`),
  createDataPool: (data: any) => api.post('/user/datapools', data),
  updateDataPool: (id: number, data: any) => api.put(`/user/datapools/${id}`, data),
  deleteDataPool: (id: number) => api.delete(`/user/datapools/${id}`),

  // 数据项管理
  listDataItems: (poolId: number, page: number, size: number, keyword?: string) =>
    api.get(`/user/dataitems/${poolId}`, { params: { page, size, keyword } }),
  getDataItem: (poolId: number, itemId: number) => api.get(`/user/dataitems/${poolId}/${itemId}`),
  createDataItem: (poolId: number, data: any) => api.post(`/user/dataitems/${poolId}`, data),
  updateDataItem: (poolId: number, itemId: number, data: any) => api.put(`/user/dataitems/${poolId}/${itemId}`, data),
  deleteDataItem: (poolId: number, itemId: number) => api.delete(`/user/dataitems/${poolId}/${itemId}`),

  // 套餐管理
  listPackages: () => api.get('/user/packages'),
  getUserPackage: () => api.get('/user/package'),
  buyPackage: (id: number) => api.post(`/user/packages/${id}/buy`),
  listUserPackages: (page: number, size: number) => api.get('/user/packages/history', { params: { page, size } }),

  // 授权证书管理
  generateCertificate: () => api.post('/user/licenses/generate'),
  encryptPreview: (certificate: string, content: string) => api.post('/user/licenses/encrypt', { certificate, content }),
  decryptContent: (certificate: string, encrypted: string) => api.post('/user/licenses/decrypt', { certificate, encrypted }),
  listLicenses: (appId?: number) => api.get('/user/licenses', { params: { app_id: appId } }),
  getLicense: (id: number) => api.get(`/user/licenses/${id}`),
  createLicense: (data: any) => api.post('/user/licenses', data),
  updateLicense: (id: number, data: any) => api.put(`/user/licenses/${id}`, data),
  deleteLicense: (id: number) => api.delete(`/user/licenses/${id}`),

  // 操作日志
  listLogs: (page: number, size: number, action?: string) =>
    api.get('/user/logs', { params: { page, size, action } }),

  // 签到
  getCheckinStatus: () => api.get('/user/checkin/status'),
  doCheckin: () => api.post('/user/checkin'),
  getCheckinLogs: (page: number, size: number) =>
    api.get('/user/checkin/logs', { params: { page, size } }),
  getMonthCheckinLogs: (year: number, month: number) =>
    api.get('/user/checkin/month-logs', { params: { year, month } }),

  // 工单
  listTickets: (page: number, size: number, status?: number) =>
    api.get('/user/tickets', { params: { page, size, status } }),
  createTicket: (data: { title: string; category: string; content: string; priority?: number }) =>
    api.post('/user/tickets', data),
  getTicket: (id: number) => api.get(`/user/tickets/${id}`),
  getTicketMessages: (id: number) => api.get(`/user/tickets/${id}/messages`),
  sendTicketMessage: (id: number, content: string) =>
    api.post(`/user/tickets/${id}/messages`, { content }),
  closeTicket: (id: number) => api.post(`/user/tickets/${id}/close`),

  // 活动管理
  listActivities: (page: number, size: number) =>
    api.get('/user/activities', { params: { page, size } }),
  getActivity: (id: number) => api.get(`/user/activities/${id}`),
  createActivity: (data: any) => api.post('/user/activities', data),
  updateActivity: (id: number, data: any) => api.put(`/user/activities/${id}`, data),
  deleteActivity: (id: number) => api.delete(`/user/activities/${id}`),
  saveActivityPrizes: (id: number, prizes: any[]) =>
    api.post(`/user/activities/${id}/prizes`, { prizes }),
  listActivityRecords: (id: number, page: number, size: number) =>
    api.get(`/user/activities/${id}/records`, { params: { page, size } }),
  manualDraw: (id: number) => api.post(`/user/activities/${id}/draw`),

  // 活动用户管理
  listActivityUsers: (page: number, size: number, keyword?: string) =>
    api.get('/user/activity-users', { params: { page, size, keyword } }),
  deleteActivityUser: (id: number) => api.delete(`/user/activity-users/${id}`),
  resetActivityUserPassword: (id: number, password: string) =>
    api.put(`/user/activity-users/${id}/password`, { password }),
  getActivityUserRecords: (id: number) =>
    api.get(`/user/activity-users/${id}/records`),

  // 推广返利管理
  getRebateConfig: () => api.get('/user/rebate/config'),
  saveRebateConfig: (data: any) => api.post('/user/rebate/config', data),
  getRebateStats: () => api.get('/user/rebate/stats'),
  listRebateLogs: (page: number, size: number) =>
    api.get('/user/rebate/logs', { params: { page, size } }),
  getRebateRanking: () => api.get('/user/rebate/ranking'),
  getInviteTree: (page: number, size: number, parentId?: number) =>
    api.get('/user/rebate/tree', { params: { page, size, parent_id: parentId } }),

  // 积分商城
  listPointShopItems: (page: number, size: number, appId?: number) =>
    api.get('/user/point-shop/items', { params: { page, size, app_id: appId } }),
  createPointShopItem: (data: any) => api.post('/user/point-shop/items', data),
  updatePointShopItem: (id: number, data: any) => api.put(`/user/point-shop/items/${id}`, data),
  deletePointShopItem: (id: number) => api.delete(`/user/point-shop/items/${id}`),
  listPointShopExchanges: (page: number, size: number, appId?: number) =>
    api.get('/user/point-shop/exchanges', { params: { page, size, app_id: appId } }),

  // 黑名单管理
  listBlacklist: (page: number, size: number, params?: { app_id?: number; type?: number; keyword?: string }) =>
    api.get('/user/blacklist', { params: { page, size, ...params } }),
  createBlacklist: (data: { app_id: number; type: number; value: string; remark?: string; expire_at?: string }) =>
    api.post('/user/blacklist', data),
  updateBlacklist: (id: number, data: { value?: string; remark?: string; expire_at?: string }) =>
    api.put(`/user/blacklist/${id}`, data),
  deleteBlacklist: (id: number) => api.delete(`/user/blacklist/${id}`),
  batchDeleteBlacklist: (ids: number[]) => api.post('/user/blacklist/batch-delete', { ids }),

  // 防火墙管理
  getFirewallConfig: (appId: number) => api.get('/user/firewall/config', { params: { app_id: appId } }),
  saveFirewallConfig: (data: any) => api.post('/user/firewall/config', data),
  listFirewallLogs: (page: number, size: number, params?: { app_id?: number; type?: string; keyword?: string }) =>
    api.get('/user/firewall/logs', { params: { page, size, ...params } }),
  clearFirewallLogs: (appId: number) => api.delete('/user/firewall/logs', { params: { app_id: appId } }),
  listLoginLocks: (appId: number) => api.get('/user/firewall/locks', { params: { app_id: appId } }),
  unlockLoginIP: (appId: number, ip: string) => api.post('/user/firewall/unlock', { app_id: appId, ip }),

  // SDK接口日志
  listSDKLogs: (page: number, size: number, params?: { app_id?: number; path?: string; keyword?: string }) =>
    api.get('/user/sdk-logs', { params: { page, size, ...params } }),
  clearSDKLogs: (appId?: number) => api.delete('/user/sdk-logs', { params: { app_id: appId } }),

  // 充值
  getRechargePackages: () => api.get('/recharge/packages'),
  createRechargeOrder: (data: { package_id: number; pay_type: string }) => api.post('/user/recharge/order', data),
  getRechargeOrderStatus: (orderNo: string) => api.get('/user/recharge/order', { params: { order_no: orderNo } }),
  getRechargeOrders: (page: number, size: number) => api.get('/user/recharge/orders', { params: { page, size } }),

  // 数据备份
  getBackupStats: () => api.get('/admin/backup/stats'),
  exportBackup: (appIds?: number[]) => {
    const params = appIds && appIds.length > 0 ? `?app_ids=${appIds.join(',')}` : ''
    return `/api/admin/backup/export${params}`
  },
  importBackup: (formData: FormData) => api.post('/admin/backup/import', formData),

  // 维护工具
  toolsBatchUserPassword: (ids: number[], password: string) => api.post('/user/tools/batch-user-password', { ids, password }),
  toolsBatchUserExpire: (ids: number[], expireAt: string) => api.post('/user/tools/batch-user-expire', { ids, expire_at: expireAt }),
  toolsBatchUserDuration: (ids: number[], days: number, hours: number, minutes: number) => 
    api.post('/user/tools/batch-user-duration', { ids, days, hours, minutes }),
  toolsBatchUserPoints: (ids: number[], points: number) => api.post('/user/tools/batch-user-points', { ids, points }),
  toolsBatchUserKick: (ids: number[]) => api.post('/user/tools/batch-user-kick', { ids }),
  toolsBatchUserUnbind: (ids: number[]) => api.post('/user/tools/batch-user-unbind', { ids }),
  toolsCleanExpiredUsers: (action: string) => api.post('/user/tools/clean-expired-users', { action }),
  toolsCleanUnusedCards: (appId?: number, days?: number) => api.post('/user/tools/clean-unused-cards', { app_id: appId, days }),
  toolsCleanUsedCards: (appId?: number) => api.post('/user/tools/clean-used-cards', { app_id: appId }),
  toolsCleanDisabledCards: (appId?: number) => api.post('/user/tools/clean-disabled-cards', { app_id: appId }),
  toolsKickAllOnline: (appId?: number) => api.post('/user/tools/kick-all-online', { app_id: appId }),
  toolsCleanExpiredBlacklist: () => api.post('/user/tools/clean-expired-blacklist', {}),

  // 条件筛选批量操作
  toolsFilterUsers: (page: number, size: number, params?: { app_id?: string; status?: string; expire?: string; points_min?: number; points_max?: number; reg_start?: string; reg_end?: string; keyword?: string }) =>
    api.get('/user/tools/filter-users', { params: { page, size, ...params } }),
  toolsFilterSetStatus: (filter: any, newStatus: number) =>
    api.post('/user/tools/filter-set-status', { filter, new_status: newStatus }),
  toolsFilterAddPoints: (filter: any, points: number) =>
    api.post('/user/tools/filter-add-points', { filter, points }),
  toolsFilterAddDuration: (filter: any, days: number, hours: number, minutes: number) =>
    api.post('/user/tools/filter-add-duration', { filter, days, hours, minutes }),
  toolsFilterSetExpire: (filter: any, expireAt: string) =>
    api.post('/user/tools/filter-set-expire', { filter, expire_at: expireAt }),
  toolsFilterDelete: (filter: any) =>
    api.post('/user/tools/filter-delete', { filter }),
  toolsFilterKick: (filter: any) =>
    api.post('/user/tools/filter-kick', { filter }),
  toolsFilterUnbind: (filter: any) =>
    api.post('/user/tools/filter-unbind', { filter }),

  // 网盘开放接口代理
  listPanFiles: (params: any, headers: any) =>
    api.get('/user/pan/files', { params, headers }),
  createPanFolder: (data: { name: string; bucketName?: string; parentId?: string; inherit?: boolean }, headers: any) =>
    api.post('/user/pan/folders', data, { headers }),
  deletePanFolder: (id: string, headers: any) =>
    api.delete(`/user/pan/folders/${id}`, { headers }),
  uploadPanFile: async (formData: FormData, headers: any, onProgress?: (progress: { percent: number; loaded: number; total: number }) => void) => {
    const response = await axios.post('/api/user/pan/files', formData, {
      headers: {
        ...getAuthHeaders(),
        ...headers,
      },
      timeout: 0,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress({ percent, loaded: progressEvent.loaded, total: progressEvent.total })
        }
      }
    })
    return response.data
  },
  createPanUploadSession: (data: any, headers: any) =>
    api.post('/user/pan/uploads', data, { headers }),
  getPanUploadSession: (uploadId: string, headers: any) =>
    api.get(`/user/pan/uploads/${uploadId}`, { headers }),
  uploadPanChunk: async (uploadId: string, index: number, formData: FormData, headers: any, onProgress?: (progress: { loaded: number; total: number }) => void) => {
    const response = await axios.post(`/api/user/pan/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`, formData, {
      headers: {
        ...getAuthHeaders(),
        ...headers,
      },
      timeout: 0,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress({ loaded: progressEvent.loaded, total: progressEvent.total })
        }
      },
    })
    return response.data
  },
  completePanUpload: (uploadId: string, data: any, headers: any) =>
    api.post(`/user/pan/uploads/${uploadId}/complete`, data, { headers }),
  cancelPanUpload: (uploadId: string, headers: any) =>
    api.delete(`/user/pan/uploads/${uploadId}`, { headers }),
  deletePanFile: (id: string, headers: any) =>
    api.delete(`/user/pan/files/${id}`, { headers }),
  getPanDirectLink: (id: string, headers: any) =>
    api.post(`/user/pan/files/${id}/direct-link`, {}, { headers }),
  createPanFileShare: (id: string, data: any, headers: any) =>
    api.post(`/user/pan/files/${id}/share`, data, { headers }),
  listPanShares: (params: any, headers: any) =>
    api.get('/user/pan/shares', { params, headers }),
  createPanShare: (data: any, headers: any) =>
    api.post('/user/pan/shares', data, { headers }),
  updatePanShare: (token: string, data: any, headers: any) =>
    api.put(`/user/pan/shares/${token}`, data, { headers }),
  deletePanShare: (token: string, headers: any) =>
    api.delete(`/user/pan/shares/${token}`, { headers }),

  // 提卡Key管理
  listWithdrawKeys: (appId?: string) =>
    api.get('/user/withdraw-keys', { params: { app_id: appId } }),
  createWithdrawKey: (data: { app_id: number; name: string; quota: number; remark?: string }) =>
    api.post('/user/withdraw-keys', data),
  updateWithdrawKey: (id: number, data: { name?: string; quota?: number; status?: number; remark?: string }) =>
    api.put(`/user/withdraw-keys/${id}`, data),
  deleteWithdrawKey: (id: number) =>
    api.delete(`/user/withdraw-keys/${id}`),
  resetWithdrawKey: (id: number) =>
    api.post(`/user/withdraw-keys/${id}/reset`),
  listWithdrawLogs: (page: number, size: number, keyId?: string) =>
    api.get('/user/withdraw-logs', { params: { page, size, key_id: keyId } }),

  // 开放API密钥管理
  listOpenApiKeys: () => api.get('/user/openapi-keys'),
  getOpenApiPermissions: () => api.get('/user/openapi-keys/permissions'),
  createOpenApiKey: (data: { name: string; permissions: string[] }) =>
    api.post('/user/openapi-keys', data),
  updateOpenApiKey: (id: number, data: { name?: string; permissions?: string[]; status?: number }) =>
    api.put(`/user/openapi-keys/${id}`, data),
  deleteOpenApiKey: (id: number) => api.delete(`/user/openapi-keys/${id}`),
  resetOpenApiKey: (id: number) => api.post(`/user/openapi-keys/${id}/reset`),
}

export const configApi = {
  getSite: () => api.get('/config/site'),
  getAnnouncements: () => api.get('/config/announcements'),
  getRegisterConfig: () => api.get('/config/register'),
  getSecurityConfig: () => api.get('/config/security'),
  getPublicSecurityConfig: () => api.get('/config/security'),
}

// 公开活动 API 使用独立实例：匿名用户访问活动页时，不应该因为 401 自动跳后台登录页。
const publicApi = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

publicApi.interceptors.response.use(
  (response) => {
    if (response.data.code !== 0) {
      return Promise.reject(new Error(response.data.message))
    }
    return response.data
  },
  (error) => {
    if (error.response?.data?.message) {
      return Promise.reject(new Error(error.response.data.message))
    }
    return Promise.reject(error)
  }
)

export const publicActivityApi = {
  register: (activityId: number, username: string, password: string) =>
    publicApi.post('/public/activity/register', { activity_id: activityId, username, password }),
  login: (activityId: number, username: string, password: string) =>
    publicApi.post('/public/activity/login', { activity_id: activityId, username, password }),
  listActivities: (ch?: string) => publicApi.get('/public/activities', { params: { ch } }),
  getActivity: (id: number, ch?: string) => publicApi.get(`/public/activities/${id}`, { params: { ch } }),
  checkJoined: (id: number, userId: number) =>
    publicApi.get(`/public/activities/${id}/joined`, { params: { user_id: userId } }),
  getWinners: (id: number) => publicApi.get(`/public/activities/${id}/winners`),
  getMyCards: (id: number, userId: number) =>
    publicApi.get(`/public/activities/${id}/my-cards`, { params: { user_id: userId } }),
  spinWheel: (id: number, userId: number) =>
    publicApi.post(`/public/activities/${id}/spin`, { user_id: userId }),
  joinTimedDraw: (id: number, userId: number) =>
    publicApi.post(`/public/activities/${id}/join`, { user_id: userId }),
  claimCard: (id: number, userId: number) =>
    publicApi.post(`/public/activities/${id}/claim`, { user_id: userId }),
  getMyRecords: (userId: number, page: number, size: number) =>
    publicApi.get('/public/activities/my-records', { params: { user_id: userId, page, size } }),
}

// adminApi：管理员后台接口。需要普通 token 且后端用户 role=1。
export const adminApi = {
  getDashboardStats: () => api.get('/admin/dashboard'),
  getHealthStatus: () => api.get('/admin/health'),
  listTasks: () => api.get('/admin/tasks'),
  updateTask: (key: string, enabled: boolean) => api.put(`/admin/tasks/${key}`, { enabled }),
  listUsers: (page: number, size: number, keyword?: string) =>
    api.get('/admin/users', { params: { page, size, keyword } }),
  updateUser: (id: number, data: { username?: string; email?: string; nickname?: string; status?: number; role?: number; max_apps?: number; max_users?: number; max_card_types?: number; max_cards?: number }) =>
    api.put(`/admin/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  rechargeUser: (id: number, amount: number, remark?: string) =>
    api.post(`/admin/users/${id}/recharge`, { amount, remark }),
  
  listAnnouncements: () => api.get('/admin/announcements'),
  saveAnnouncements: (data: { content: string; color: string; popup?: boolean }[]) =>
    api.post('/admin/announcements', data),
  createAnnouncement: (data: { title: string; content: string; color?: string; popup?: number; status?: number; sort?: number }) =>
    api.post('/admin/announcements/create', data),
  updateAnnouncement: (id: number, data: { title?: string; content?: string; color?: string; popup?: number; status?: number; sort?: number }) =>
    api.put(`/admin/announcements/${id}`, data),
  deleteAnnouncement: (id: number) => api.delete(`/admin/announcements/${id}`),

  getSiteConfig: () => api.get('/admin/site'),
  saveSiteConfig: (data: { site_name: string; site_subtitle: string; site_logo: string; site_logo_dark: string; site_favicon: string; service_qq: string }) =>
    api.post('/admin/site', data),
  uploadSiteAsset: (formData: FormData) => api.post('/admin/site/upload', formData),

  // 邮箱配置
  getEmailConfig: () => api.get('/admin/email'),
  saveEmailConfig: (data: { smtp_host: string; smtp_port: number; smtp_user: string; smtp_pass: string; smtp_ssl: number; from_name: string; code_template: string }) =>
    api.post('/admin/email', data),
  testSendEmail: (toEmail: string) => api.post('/admin/email/test', { to_email: toEmail }),

  // 注册登录配置
  getRegisterConfig: () => api.get('/admin/register'),
  saveRegisterConfig: (data: { max_apps: number; max_users: number; max_card_types: number; max_cards: number; register_enabled: number; require_email_code: number; require_captcha?: number; reg_rate_limit?: number; reg_ip_max_total?: number }) =>
    api.post('/admin/register', data),

  // TG通知配置
  getTelegramConfig: () => api.get('/admin/telegram'),
  saveTelegramConfig: (data: { bot_token: string; chat_id: string; proxy_url: string; notify_register: number; notify_package: number }) =>
    api.post('/admin/telegram', data),
  testTelegramNotify: () => api.post('/admin/telegram/test'),

  // 签到配置
  getCheckinConfig: () => api.get('/admin/checkin'),
  saveCheckinConfig: (data: { min_reward: number; max_reward: number; enabled: number }) =>
    api.post('/admin/checkin', data),
  addStreakReward: (data: { streak_days: number; extra_reward: number }) =>
    api.post('/admin/checkin/streak', data),
  deleteStreakReward: (id: number) => api.delete(`/admin/checkin/streak/${id}`),
  listStreakRewards: () => api.get('/admin/checkin/streaks'),

  // 安全配置
  getSecurityConfig: () => api.get('/admin/security'),
  saveSecurityConfig: (data: { enable_captcha: number; captcha_after_fails: number; max_login_fails: number; lock_duration: number; primary_color: string }) =>
    api.post('/admin/security', data),

  // SDK 通讯加解密配置
  getSDKCryptoConfig: () => api.get('/admin/sdk-crypto'),
  saveSDKCryptoConfig: (data: any) => api.post('/admin/sdk-crypto', data),

  // 社交登录配置
  getSocialLoginConfig: () => api.get('/admin/social-login'),
  saveSocialLoginConfig: (data: any) => api.post('/admin/social-login', data),

  // 工单管理
  listTickets: (page: number, size: number, status?: number, keyword?: string) =>
    api.get('/admin/tickets', { params: { page, size, status, keyword } }),
  getTicket: (id: number) => api.get(`/admin/tickets/${id}`),
  getTicketMessages: (id: number) => api.get(`/admin/tickets/${id}/messages`),
  sendTicketMessage: (id: number, content: string) =>
    api.post(`/admin/tickets/${id}/messages`, { content }),
  updateTicketStatus: (id: number, status: number) =>
    api.put(`/admin/tickets/${id}/status`, { status }),
  deleteTicket: (id: number) => api.delete(`/admin/tickets/${id}`),

  // 套餐管理
  listPackages: () => api.get('/admin/packages'),
  createPackage: (data: any) => api.post('/admin/packages', data),
  updatePackage: (id: number, data: any) => api.put(`/admin/packages/${id}`, data),
  deletePackage: (id: number) => api.delete(`/admin/packages/${id}`),
  uploadPackageIcon: (formData: FormData) => api.post('/admin/packages/upload', formData),

  listApps: (page: number, size: number, keyword?: string, userId?: number) =>
    api.get('/admin/apps', { params: { page, size, keyword, user_id: userId } }),
  updateApp: (id: number, data: {
    app_name?: string; description?: string; login_mode?: number; billing_mode?: number;
    heartbeat?: number; crypto_mode?: string; app_secret?: string; sign_algo?: string; server_sign_algo?: string;
    custom_fields?: { key: string; value: string }[];
    bind_device?: number; channel_mode?: number; reg_mode?: number; reg_limit?: number; status?: number
  }) => api.put(`/admin/apps/${id}`, data),
  resetAppSecret: (id: number) => api.post(`/admin/apps/${id}/reset-secret`),
  deleteApp: (id: number) => api.delete(`/admin/apps/${id}`),

  // 应用公告管理
  listAppAnnouncements: (appId: number, page: number, size: number) =>
    api.get('/admin/app-announcements', { params: { app_id: appId, page, size } }),
  createAppAnnouncement: (data: any) => api.post('/admin/app-announcements', data),
  updateAppAnnouncement: (id: number, data: any) => api.put(`/admin/app-announcements/${id}`, data),
  deleteAppAnnouncement: (id: number) => api.delete(`/admin/app-announcements/${id}`),

  // 软件用户管理
  listAppUsers: (page: number, size: number, userId?: number, keyword?: string, appId?: number | string, filter?: string) =>
    api.get('/admin/appusers', { params: { page, size, user_id: userId, keyword, app_id: appId || undefined, filter: filter || undefined } }),
  listRiskAppUsers: (page: number, size: number, level?: string, keyword?: string) =>
    api.get('/admin/appusers/risk', { params: { page, size, level: level || undefined, keyword } }),
  disposeRiskAppUser: (id: number, action: string) => api.post(`/admin/appusers/${id}/risk-dispose`, { action }),
  getAppUser: (id: number) => api.get(`/admin/appusers/${id}`),
  getAppUserProfile: (id: number) => api.get(`/admin/appusers/${id}/profile`),
  createAppUser: (data: any) => api.post('/admin/appusers', data),
  updateAppUser: (id: number, data: any) => api.put(`/admin/appusers/${id}`, data),
  uploadAppUserAvatar: (id: number, formData: FormData) => api.post(`/admin/appusers/${id}/avatar`, formData),
  resetAppUserInviteCode: (id: number) => api.post(`/admin/appusers/${id}/reset-invite-code`),
  batchUpdateAppUserStatus: (ids: number[], status: number) => api.post('/admin/appusers/batch-status', { ids, status }),
  batchDeleteAppUsers: (ids: number[]) => api.post('/admin/appusers/batch-delete', { ids }),
  deleteAppUser: (id: number) => api.delete(`/admin/appusers/${id}`),

  // 用户标识数据管理
  listAppUserData: (appUserId: number, page: number, size: number) =>
    api.get(`/admin/appusers/${appUserId}/data`, { params: { page, size } }),
  createAppUserData: (appUserId: number, data: { key: string; value: string; remark?: string; expire_at?: string }) =>
    api.post(`/admin/appusers/${appUserId}/data`, data),
  updateAppUserData: (appUserId: number, dataId: number, data: { key?: string; value?: string; remark?: string; expire_at?: string }) =>
    api.put(`/admin/appusers/${appUserId}/data/${dataId}`, data),
  deleteAppUserData: (appUserId: number, dataId: number) =>
    api.delete(`/admin/appusers/${appUserId}/data/${dataId}`),

  // 用户特征码管理
  listAppUserDevices: (appUserId: number, page: number, size: number) =>
    api.get(`/admin/appusers/${appUserId}/devices`, { params: { page, size } }),
  deleteAppUserDevice: (appUserId: number, deviceId: number) =>
    api.delete(`/admin/appusers/${appUserId}/devices/${deviceId}`),

  // 用户操作日志
  listAppUserLogs: (appUserId: number, page: number, size: number, action?: string) =>
    api.get(`/admin/appusers/${appUserId}/logs`, { params: { page, size, action: action || undefined } }),
  clearAppUserLogs: (appUserId: number) =>
    api.delete(`/admin/appusers/${appUserId}/logs`),
  listCardTypes: (page: number, size: number, appId?: number) =>
    api.get('/admin/cardtypes', { params: { page, size, app_id: appId } }),
  getCardType: (id: number) => api.get(`/admin/cardtypes/${id}`),
  createCardType: (data: any) => api.post('/admin/cardtypes', data),
  updateCardType: (id: number, data: any) => api.put(`/admin/cardtypes/${id}`, data),
  deleteCardType: (id: number) => api.delete(`/admin/cardtypes/${id}`),

  // 卡号管理
  listCards: (page: number, size: number, params?: { app_id?: number; card_type_id?: number; batch_no?: string; status?: number; keyword?: string }) =>
    api.get('/admin/cards', { params: { page, size, ...params } }),
  updateCardStatus: (id: number, status: number) => api.put(`/admin/cards/${id}/status`, { status }),
  deleteCard: (id: number) => api.delete(`/admin/cards/${id}`),

  // 版本管理
  listAppVersions: (page: number, size: number, appId?: number) =>
    api.get('/admin/versions', { params: { page, size, app_id: appId } }),
  getAppVersion: (id: number) => api.get(`/admin/versions/${id}`),
  updateAppVersion: (id: number, data: any) => api.put(`/admin/versions/${id}`, data),
  deleteAppVersion: (id: number) => api.delete(`/admin/versions/${id}`),

  // 在线管理
  listOnlineSessions: (page: number, size: number, appId?: number, keyword?: string, appUserId?: number) =>
    api.get('/admin/online', { params: { page, size, app_id: appId, keyword, app_user_id: appUserId } }),
  kickOnlineSession: (id: number) => api.delete(`/admin/online/${id}`),
  kickOnlineSessionsByApp: (appId: number) => api.post('/admin/online/kick-app', { app_id: appId }),
  kickOnlineSessionsByUser: (_appId: number, appUserId: number) =>
    api.post('/admin/online/kick-user', { app_user_id: appUserId }),

  // 操作日志
  listLogs: (page: number, size: number, params?: { user_id?: number; action?: string; module?: string }) =>
    api.get('/admin/logs', { params: { page, size, ...params } }),

  // 充值管理
  getRechargeConfig: () => api.get('/admin/recharge/config'),
  saveRechargeConfig: (data: any) => api.post('/admin/recharge/config', data),
  getRechargePackages: () => api.get('/admin/recharge/packages'),
  createRechargePackage: (data: any) => api.post('/admin/recharge/packages', data),
  updateRechargePackage: (id: number, data: any) => api.put(`/admin/recharge/packages/${id}`, data),
  deleteRechargePackage: (id: number) => api.delete(`/admin/recharge/packages/${id}`),
  getRechargeOrders: (page: number, size: number, status?: string) =>
    api.get('/admin/recharge/orders', { params: { page, size, status } }),
  completeRechargeOrder: (id: number) => api.post(`/admin/recharge/orders/${id}/complete`),

  // 数据备份
  getBackupStats: () => api.get('/admin/backup/stats'),
  exportBackup: (appIds?: number[]) => {
    const params = appIds && appIds.length > 0 ? `?app_ids=${appIds.join(',')}` : ''
    return `/api/admin/backup/export${params}`
  },
  importBackup: (formData: FormData) => api.post('/admin/backup/import', formData),
}

// 代理中心 API 使用独立实例和独立 token，避免代理登录态覆盖作者/管理员登录态。
const agentApi = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

agentApi.interceptors.request.use((config) => {
  // 代理登录成功后保存的是 agent_token，不是普通后台的 token。
  const token = localStorage.getItem('agent_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

agentApi.interceptors.response.use(
  (response) => {
    // 导出卡号/日志时会请求 text/blob/arraybuffer，不能套普通 { code, data } 判断。
    const rt = response.config.responseType
    if (rt === 'text' || rt === 'blob' || rt === 'arraybuffer') {
      return response.data
    }
    if (response.data.code !== 0) {
      return Promise.reject(new Error(response.data.message))
    }
    return response.data
  },
  (error) => {
    // 只清理代理 token，并跳代理登录页。
    if (error.response?.status === 401) {
      localStorage.removeItem('agent_token')
      window.location.href = '/agent/login'
    }
    if (error.response?.data?.message) {
      return Promise.reject(new Error(error.response.data.message))
    }
    return Promise.reject(error)
  }
)

// agentCenterApi：代理中心页面调用的 API，对应后端 /api/agent/*。
export const agentCenterApi = {
  login: (appCode: string, username: string, password: string) =>
    api.post('/agent/login', { app_code: appCode, username, password }),
  getProfile: () => agentApi.get('/agent/profile'),
  uploadAvatar: (formData: FormData) => agentApi.post('/agent/avatar', formData),
  changePassword: (old_password: string, new_password: string) =>
    agentApi.post('/agent/password', { old_password, new_password }),
  getStats: () => agentApi.get('/agent/stats'),
  listBalanceLogs: (page: number, size: number) =>
    agentApi.get('/agent/balance-logs', { params: { page, size } }),
  listSubAgents: (page: number, size: number, keyword?: string) =>
    agentApi.get('/agent/sub-agents', { params: { page, size, keyword } }),
  createSubAgent: (data: any) => agentApi.post('/agent/sub-agents', data),
  updateSubAgent: (id: number, data: any) => agentApi.put(`/agent/sub-agents/${id}`, data),
  deleteSubAgent: (id: number) => agentApi.delete(`/agent/sub-agents/${id}`),
  transferToSubAgent: (id: number, amount: number, remark?: string) =>
    agentApi.post(`/agent/sub-agents/${id}/transfer`, { amount, remark }),
  listSubAgentCardTypes: (id: number) => agentApi.get(`/agent/sub-agents/${id}/cardtypes`),
  setSubAgentCardTypes: (id: number, cardTypes: { card_type_id: number; price: number }[]) =>
    agentApi.post(`/agent/sub-agents/${id}/cardtypes`, { card_types: cardTypes }),
  listStockPackages: (page: number, size: number) =>
    agentApi.get('/agent/stock-packages', { params: { page, size } }),
  createStockPackage: (data: any) => agentApi.post('/agent/stock-packages', data),
  assignStockPackage: (id: number, assigned_agent_id: number) =>
    agentApi.post(`/agent/stock-packages/${id}/assign`, { assigned_agent_id }),
  recycleStockPackage: (id: number) => agentApi.post(`/agent/stock-packages/${id}/recycle`),
  toggleStockPackageStatus: (id: number) => agentApi.post(`/agent/stock-packages/${id}/status`),
  deleteStockPackage: (id: number) => agentApi.delete(`/agent/stock-packages/${id}`),
  listUsableStockPackages: () => agentApi.get('/agent/stock-packages/usable'),
  generateCardsFromStockPackage: (id: number, data: { card_type_id: number; count: number; remark?: string }) =>
    agentApi.post(`/agent/stock-packages/${id}/generate`, data),
  listCardTypes: () => agentApi.get('/agent/cardtypes'),
  generateCards: (data: { card_type_id: number; count: number; remark?: string }) =>
    agentApi.post('/agent/cards/generate', data),
  listCards: (page: number, size: number, params?: { card_type_id?: number; batch_no?: string; status?: number; keyword?: string }) =>
    agentApi.get('/agent/cards', { params: { page, size, ...params } }),
  exportCards: (params?: { card_type_id?: number; batch_no?: string; status?: number; keyword?: string }) =>
    agentApi.get('/agent/cards/export', { params, responseType: 'text' }),
  listCardLogs: (
    page: number,
    size: number,
    params?: { card_type_id?: number; date_from?: string; date_to?: string }
  ) => agentApi.get('/agent/card-logs', { params: { page, size, ...params } }),
  exportCardLogs: (params?: { card_type_id?: number; date_from?: string; date_to?: string }) =>
    agentApi.get('/agent/card-logs/export', { params, responseType: 'text' }),
  listUsers: (page: number, size: number, keyword?: string) =>
    agentApi.get('/agent/users', { params: { page, size, keyword } }),
  updateUserStatus: (id: number, status: number) =>
    agentApi.put(`/agent/users/${id}/status`, { status }),
  listUserDevices: (userId: number) => agentApi.get(`/agent/users/${userId}/devices`),
  unbindUserDevice: (userId: number, deviceId: number) =>
    agentApi.delete(`/agent/users/${userId}/devices/${deviceId}`),
  listOnlineSessions: (page: number, size: number, params?: { app_user_id?: number; keyword?: string }) =>
    agentApi.get('/agent/online', { params: { page, size, ...params } }),
  kickOnlineSession: (id: number) => agentApi.delete(`/agent/online/${id}`),
  kickOnlineByUser: (app_user_id: number) =>
    agentApi.post('/agent/online/kick-user', { app_user_id }),
}

export default api
