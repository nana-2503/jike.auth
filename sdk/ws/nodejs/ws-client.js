/**
 * WebSocket SDK 客户端
 *
 * 用法:
 *   const WSClient = require('./ws-client')
 *   const client = new WSClient('ws://your-domain/ws', 'app-code', 'app-secret', 'app-key', '[data][key]', '[data][key]')
 *   await client.connect()
 *   const res = await client.login('testuser', '123456', { feature: 'DEVICE-001' })
 *   console.log(res)
 */

const WebSocket = require('ws')
const crypto = require('crypto')

class WSClient {
  /**
   * @param {string} wsURL       - WebSocket 地址，如 ws://example.com/ws
   * @param {string} appCode     - 应用编码 (app_code)
   * @param {string} appSecret   - 通讯密钥 (app_secret)，为空则明文通讯
   * @param {string} appKey      - 签名密钥 (app_key)，用于签名计算
   * @param {string} serverSignAlgo - 服务端签名算法模板（验证客户端请求），如 "[data][key]"
   * @param {string} signAlgo    - 客户端签名算法模板（验证服务端响应），如 "[data][key]"
   */
  constructor(wsURL, appCode, appSecret = '', appKey = '', serverSignAlgo = '', signAlgo = '') {
    this.wsURL = wsURL
    this.appCode = appCode
    this.appSecret = appSecret
    this.appKey = appKey
    this.serverSignAlgo = serverSignAlgo
    this.signAlgo = signAlgo
    this.ws = null
    this.reqId = 0
    this.pending = new Map()  // reqId -> { resolve, reject, timer }，用于把服务端响应匹配回调用方 Promise
    this.token = null
    this.loggedIn = false
    this.timeout = 10000      // 默认请求超时 10s
    this.onKicked = null      // 被踢回调
    this.onClose = null       // 断开回调
    this.onError = null       // 错误回调
  }

  /** 是否启用加密 */
  get encrypted() {
    return this.appSecret !== '' && this.appSecret != null
  }

  // ==================== 加解密 ====================

  /** AES-256-CBC 加密，随机IV前置，Base64输出 */
  _encrypt(plainText) {
    const keyBuf = this._normalizeKey(this.appSecret)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv)
    const padded = this._pkcs7Pad(Buffer.from(plainText, 'utf8'), 16)
    cipher.setAutoPadding(false)
    const ct = Buffer.concat([cipher.update(padded), cipher.final()])
    return Buffer.concat([iv, ct]).toString('base64')
  }

  /** AES-256-CBC 解密，从Base64中提取IV+密文 */
  _decrypt(base64Str) {
    const keyBuf = this._normalizeKey(this.appSecret)
    const combined = Buffer.from(base64Str, 'base64')
    const iv = combined.subarray(0, 16)
    const ct = combined.subarray(16)
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv)
    decipher.setAutoPadding(false)
    const padded = Buffer.concat([decipher.update(ct), decipher.final()])
    return this._pkcs7Unpad(padded).toString('utf8')
  }

  /** 密钥规范化：固定使用 AES-256，截取/补零到32字节 */
  _normalizeKey(key) {
    const buf = Buffer.from(key, 'utf8')
    if (buf.length < 32) {
      const padded = Buffer.alloc(32, 0)
      buf.copy(padded)
      return padded
    }
    return buf.subarray(0, 32)
  }

  /** 计算请求签名：用 serverSignAlgo 模板 */
  _calcSign(data) {
    if (!this.serverSignAlgo) return ''
    const str = this.serverSignAlgo.replace(/\[data\]/g, data).replace(/\[key\]/g, this.appKey)
    return crypto.createHash('sha256').update(str).digest('hex')
  }

  /** 验证响应签名：用 signAlgo 模板 */
  _verifySign(data, sign) {
    if (!this.signAlgo) return true  // 未配置则跳过验证
    if (!sign) return false
    const str = this.signAlgo.replace(/\[data\]/g, data).replace(/\[key\]/g, this.appKey)
    const expected = crypto.createHash('sha256').update(str).digest('hex')
    return expected === sign
  }

  _pkcs7Pad(buf, blockSize) {
    const padding = blockSize - (buf.length % blockSize)
    return Buffer.concat([buf, Buffer.alloc(padding, padding)])
  }

  _pkcs7Unpad(buf) {
    if (buf.length === 0) return buf
    const n = buf[buf.length - 1]
    if (n === 0 || n > buf.length || n > 16) return buf
    for (let i = buf.length - n; i < buf.length; i++) {
      if (buf[i] !== n) return buf
    }
    return buf.subarray(0, buf.length - n)
  }

  // ==================== 连接管理 ====================

  /** 建立 WebSocket 连接 */
  connect() {
    // connect 只建立长连接，不代表已登录；业务登录需要再调用 login/card_login/trial 等方法。
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsURL)

      this.ws.on('open', () => resolve())

      this.ws.on('message', (raw) => {
        let msg
        try { msg = JSON.parse(raw.toString()) } catch { return }
        this._handleMessage(msg)
      })

      this.ws.on('close', () => {
        this.loggedIn = false
        this.token = null
        // 清理所有等待中的请求
        for (const [, p] of this.pending) {
          clearTimeout(p.timer)
          p.reject(new Error('连接已断开'))
        }
        this.pending.clear()
        if (this.onClose) this.onClose()
      })

      this.ws.on('error', (err) => {
        if (this.onError) this.onError(err)
        reject(err)
      })
    })
  }

  /** 关闭连接 */
  close() {
    if (this.ws) this.ws.close()
  }

  /** 处理收到的消息 */
  _handleMessage(msg) {
    // 被踢下线推送
    if (msg.action === 'kicked') {
      this.loggedIn = false
      this.token = null
      if (this.onKicked) this.onKicked(msg.message)
      return
    }

    // 普通响应必须带 req_id，和 _request 里保存的 pending Promise 对上。
    const reqId = msg.req_id
    const p = this.pending.get(reqId)
    if (!p) return

    clearTimeout(p.timer)
    this.pending.delete(reqId)

    // 解密响应
    let result
    if (this.encrypted && typeof msg.data === 'string' && msg.data !== '') {
      // 验证响应签名
      if (!this._verifySign(msg.data, msg.sign)) {
        p.reject(new Error('响应签名验证失败'))
        return
      }
      try {
        const plain = this._decrypt(msg.data)
        result = JSON.parse(plain)
      } catch {
        p.reject(new Error('响应解密失败'))
        return
      }
    } else {
      result = { code: msg.code, message: msg.message, data: msg.data, time: msg.time }
    }

    if (result.code === 0) {
      p.resolve(result)
    } else {
      p.reject(new Error(result.message || `错误码: ${result.code}`))
    }
  }

  // ==================== 底层发送 ====================

  /** 发送请求并等待响应 */
  _request(action, data = {}, needAppCode = true) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket 未连接'))
      }

      // req_id 在单个连接内递增即可，服务端会原样回传。
      const reqId = String(++this.reqId)
      const msg = { action, req_id: reqId }

      if (needAppCode) {
        msg.app_code = this.appCode
      }

      // 加密 data
      if (this.encrypted) {
        // 与 HTTP SDK 一样，WebSocket 外层 JSON 明文，业务 data 加密后再签名。
        const jsonStr = JSON.stringify(data)
        const encrypted = this._encrypt(jsonStr)
        msg.data = encrypted
        msg.sign = this._calcSign(encrypted)
      } else {
        msg.data = data
      }

      const timer = setTimeout(() => {
        this.pending.delete(reqId)
        reject(new Error(`请求超时: ${action}`))
      }, this.timeout)

      this.pending.set(reqId, { resolve, reject, timer })
      this.ws.send(JSON.stringify(msg))
    })
  }

  // ==================== 公开操作 ====================

  /** 用户注册 */
  async register(user, password, opts = {}) {
    return this._request('register', { user, password, ...opts })
  }

  /** 用户登录 */
  async login(user, password, opts = {}) {
    // 登录成功后保存 token/loggedIn。后续认证 action 仍通过同一个 WS 连接发送。
    const res = await this._request('login', { user, password, ...opts })
    this.token = res.data?.token
    this.loggedIn = true
    return res
  }

  /** 离线充值 */
  async rechargeOffline(user, password, cardNo) {
    return this._request('recharge_offline', { user, password, card_no: cardNo })
  }

  /** 获取默认版本 */
  async getVersion() {
    return this._request('get_version', {})
  }

  /** 获取版本列表 */
  async getVersions() {
    return this._request('get_versions', {})
  }

  /** 获取数据池列表 */
  async getDataPools() {
    return this._request('get_datapools', {})
  }

  /** 获取数据项 */
  async getDataItem(poolCode, itemCode) {
    return this._request('get_dataitem', { pool_code: poolCode, item_code: itemCode })
  }

  /** 找回密码 - 发送验证码 */
  async forgotPasswordSendCode(user, email) {
    return this._request('forgot_password', { user, email })
  }

  /** 找回密码 - 验证并重置 */
  async forgotPasswordReset(user, email, code, newPassword) {
    return this._request('forgot_password', { user, email, code, new_password: newPassword })
  }

  // ==================== 认证操作 ====================

  /** Ping 保活 */
  async ping() {
    return this._request('ping', {}, false)
  }

  /** 心跳 */
  async heartbeat() {
    // 心跳用于刷新在线会话，应用后台的 heartbeat 配置决定服务端过期判断。
    return this._request('heartbeat', {})
  }

  /** 注销登录 */
  async logout() {
    const res = await this._request('logout', {})
    this.loggedIn = false
    this.token = null
    return res
  }

  /** 获取用户信息 */
  async getUserInfo() {
    return this._request('get_user_info', {})
  }

  /** 修改密码 */
  async changePassword(oldPassword, newPassword) {
    return this._request('change_password', { old_password: oldPassword, new_password: newPassword })
  }

  /** 卡密充值（已登录） */
  async recharge(cardNo) {
    return this._request('recharge', { card_no: cardNo })
  }

  /** 扣点 */
  async deductPoints(points) {
    return this._request('deduct_points', { points })
  }

  /** 扣时（分钟） */
  async deductTime(minutes) {
    return this._request('deduct_time', { minutes })
  }

  /** 获取用户标识数据 */
  async getData(key = '') {
    return this._request('get_data', key ? { key } : {})
  }

  /** 设置用户标识数据 */
  async setData(key, value, expireAt = '') {
    const data = { key, value }
    if (expireAt) data.expire_at = expireAt
    return this._request('set_data', data)
  }

  /** 删除用户标识数据 */
  async deleteData(key) {
    return this._request('delete_data', { key })
  }

  /** 获取设备列表 */
  async getDevices() {
    return this._request('get_devices', {})
  }

  /** 按设备列表序列号解绑设备，1 表示第一条 */
  async unbindDevice(deviceSerial) {
    return this._request('unbind_device', { device_id: deviceSerial })
  }

  /** 按特征码解绑 */
  async unbind(feature) {
    return this._request('unbind', { feature })
  }

  /** 获取云端数据 */
  async getCloudData() {
    return this._request('get_cloud_data', {})
  }

  /** 设置云端数据 */
  async setCloudData(cloudData) {
    return this._request('set_cloud_data', { cloud_data: cloudData })
  }

  // ==================== 自动心跳 ====================

  /**
   * 启动自动心跳
   * @param {number} intervalMs - 心跳间隔（毫秒），默认30秒
   */
  startHeartbeat(intervalMs = 30000) {
    // 建议登录后开启自动心跳；未登录时会发 ping 保持连接活跃。
    this.stopHeartbeat()
    this._heartbeatTimer = setInterval(async () => {
      try {
        if (this.loggedIn) await this.heartbeat()
        else await this.ping()
      } catch { /* 忽略心跳错误 */ }
    }, intervalMs)
  }

  /** 停止自动心跳 */
  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }
}

module.exports = WSClient
