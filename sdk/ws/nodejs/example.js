/**
 * WebSocket SDK 使用示例
 *
 * 安装依赖: npm install ws
 * 运行: node example.js
 */

const WSClient = require('./ws-client')

// ========== 配置 ==========
// 以下全部为占位符，请替换为你自己应用管理后台中生成的凭证。
const WS_URL = 'ws://localhost:8081/ws'
const APP_CODE = '<your-app-code>'
const APP_KEY = '<your-app-key>'                      // 签名密钥
const APP_SECRET = '<your-app-secret>'                // 留空则明文通讯
const SIGN_ALGO = '<prefix[key]<random-suffix><prefix>[data]<random-suffix>'         // 客户端签名算法（用于验证响应签名）
const SERVER_SIGN_ALGO = '<prefix[key]<random-suffix><prefix>[data]<random-suffix>'   // 服务端签名算法（用于请求签名）

async function main() {
  const client = new WSClient(WS_URL, APP_CODE, APP_SECRET, APP_KEY, SERVER_SIGN_ALGO, SIGN_ALGO)

  // 事件回调
  client.onKicked = (msg) => console.log('[被踢下线]', msg)
  client.onClose = () => console.log('[连接关闭]')
  client.onError = (err) => console.error('[连接错误]', err.message)

  // 1. 建立连接
  await client.connect()
  console.log('✓ 连接成功')

  // 2. Ping 测试
  await client.ping()
  console.log('✓ Ping 成功')

  // 3. 用户注册（首次使用时取消注释）
  try {
    const regRes = await client.register('<your-username>', '<your-password>', { feature: 'DEVICE-001' })
    console.log('✓ 注册成功:', regRes.data)
  } catch (e) {
    console.log('注册:', e.message)
  }

  // 4. 用户登录
  try {
    const loginRes = await client.login('<your-username>', '<your-password>', {
      feature: 'DEVICE-001',
      version: '1.0.0',
      client_id: 'nodejs-example',
      client_os: process.platform
    })
    console.log('✓ 登录成功:', loginRes.data)
  } catch (e) {
    console.error('✗ 登录失败:', e.message)
    client.close()
    return
  }

  // 5. 启动自动心跳（30秒间隔）
  client.startHeartbeat(30000)
  console.log('✓ 自动心跳已启动（30秒间隔）')

  // 6. 获取用户信息
  try {
    const info = await client.getUserInfo()
    console.log('✓ 用户信息:', info.data)
  } catch (e) {
    console.log('获取用户信息:', e.message)
  }

  // 7. 获取版本
  try {
    const ver = await client.getVersion()
    console.log('✓ 默认版本:', ver.data)
  } catch (e) {
    console.log('获取版本:', e.message)
  }

  // 8. 用户标识数据
  try {
    await client.setData('test_key', 'hello world', '2026-12-31 23:59:59')
    console.log('✓ 设置标识数据成功')

    const dataRes = await client.getData('test_key')
    console.log('✓ 获取标识数据:', dataRes.data)

    await client.deleteData('test_key')
    console.log('✓ 删除标识数据成功')
  } catch (e) {
    console.log('标识数据:', e.message)
  }

  // 9. 云端数据
  try {
    await client.setCloudData('{"config": "test"}')
    console.log('✓ 设置云端数据成功')

    const cloud = await client.getCloudData()
    console.log('✓ 云端数据:', cloud.data)
  } catch (e) {
    console.log('云端数据:', e.message)
  }

  // 10. 设备列表
  try {
    const devices = await client.getDevices()
    console.log('✓ 设备列表:', devices.data)
  } catch (e) {
    console.log('设备列表:', e.message)
  }

  // 保持连接，不注销
  console.log('\n========== 保活中，按 Ctrl+C 退出 ==========')

  // 优雅退出：Ctrl+C 时停止心跳并关闭连接
  process.on('SIGINT', () => {
    console.log('\n正在退出...')
    client.stopHeartbeat()
    client.close()
    process.exit(0)
  })
}

main().catch(console.error)
