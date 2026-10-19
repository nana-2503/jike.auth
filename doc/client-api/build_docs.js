const fs = require('fs');
const path = require('path');

const docs = [
  {
    group: '快速开始',
    items: [
      { id: 'overview', title: '接口总览', file: '接口总览.md' },
      { id: 'encrypt', title: '通讯加密说明', file: '通讯加密说明.md' },
      { id: 'aes-flow', title: '加解密流程', file: '加解密流程.md' },
      { id: 'sign-flow', title: '签名流程', file: '签名流程.md' },
      { id: 'websocket', title: 'WebSocket接口', file: 'WebSocket接口.md' }
    ]
  },
  {
    group: '通用',
    items: [
      { id: 'register', title: '用户注册', file: '用户注册.md' },
      { id: 'login', title: '用户登录', file: '用户登录.md' },
      { id: 'card-login', title: '卡号登录', file: '卡号登录.md' },
      { id: 'trial', title: '试用登录', file: '试用登录.md' },
      { id: 'app-info', title: '获取应用信息', file: '获取应用信息.md' },
      { id: 'logout', title: '注销登录', file: '注销登录.md' },
      { id: 'heartbeat', title: '心跳', file: '心跳.md' },
      { id: 'change-pwd', title: '修改密码', file: '修改密码.md' },
      { id: 'forgot-pwd', title: '找回密码', file: '找回密码.md' },
      { id: 'report-error', title: '上报异常日志', file: '上报异常日志.md' }
    ]
  },
  {
    group: '验证码',
    items: [
      { id: 'captcha', title: '获取图形验证码', file: '获取验证码.md' },
      { id: 'send-email-code', title: '发送邮箱验证码', file: '发送邮箱验证码.md' }
    ]
  },
  {
    group: '充值扣费',
    items: [
      { id: 'recharge', title: '卡密充值', file: '卡密充值.md' },
      { id: 'recharge-offline', title: '离线充值', file: '离线充值.md' },
      { id: 'deduct-points', title: '扣点', file: '扣点.md' },
      { id: 'deduct-time', title: '扣时', file: '扣时.md' }
    ]
  },
  {
    group: '用户数据',
    items: [
      { id: 'userinfo', title: '获取用户信息', file: '获取用户信息.md' },
      { id: 'avatar', title: '上传用户头像', file: '上传用户头像.md' },
      { id: 'extradata', title: '获取附加数据', file: '获取附加数据.md' },
      { id: 'clouddata-get', title: '获取云端数据', file: '获取云端数据.md' },
      { id: 'clouddata-set', title: '设置云端数据', file: '设置云端数据.md' },
      { id: 'usermark-get', title: '获取标识数据', file: '获取标识数据.md' },
      { id: 'usermark-set', title: '设置标识数据', file: '设置标识数据.md' }
    ]
  },
  {
    group: '积分商城',
    items: [
      { id: 'point-shop-items', title: '获取积分商城商品', file: '获取积分商城商品.md' },
      { id: 'point-shop-exchange', title: '兑换积分商城商品', file: '兑换积分商城商品.md' },
      { id: 'point-shop-exchanges', title: '获取积分商城兑换记录', file: '获取积分商城兑换记录.md' }
    ]
  },
  {
    group: '设备管理',
    items: [
      { id: 'devices', title: '获取设备列表', file: '获取设备列表.md' },
      { id: 'unbind-device', title: '解绑设备', file: '解绑设备.md' }
    ]
  },
  {
    group: '版本与公告',
    items: [
      { id: 'versions', title: '获取版本列表', file: '获取版本列表.md' },
      { id: 'version', title: '获取指定版本', file: '获取指定版本.md' },
      { id: 'announcements', title: '获取应用公告列表', file: '获取应用公告列表.md' }
    ]
  },
  {
    group: '数据池',
    items: [
      { id: 'datapools', title: '获取数据池', file: '获取数据池列表.md' },
      { id: 'datapool-create', title: '新增数据池', file: '新增数据池.md' },
      { id: 'dataitem', title: '获取数据项', file: '获取数据项.md' },
      { id: 'dataitem-create', title: '新增数据项', file: '新增数据项.md' },
      { id: 'dataitem-delete', title: '删除数据项', file: '删除数据项.md' },
      { id: 'dataitem-update', title: '修改数据项', file: '修改数据项.md' }
    ]
  },
  {
    group: '授权证书',
    items: [
      { id: 'license-verify', title: '验证授权证书', file: '验证授权证书.md' }
    ]
  }
];

// 读取所有md文件内容
const docDir = __dirname;
docs.forEach(group => {
  group.items.forEach(item => {
    const filePath = path.join(docDir, item.file);
    try {
      item.md = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.error(`读取失败: ${item.file}`, e.message);
      item.md = `# ${item.title}\n\n文件未找到: ${item.file}`;
    }
  });
});

// 生成 docs.js
let output = 'const docs = [\n';
docs.forEach((group, gi) => {
  output += '  {\n';
  output += `    group: ${JSON.stringify(group.group)},\n`;
  output += '    items: [\n';
  group.items.forEach((item, ii) => {
    output += '      { ';
    output += `id: ${JSON.stringify(item.id)}, `;
    output += `title: ${JSON.stringify(item.title)}, `;
    output += `file: ${JSON.stringify(item.file)}, `;
    output += `md: ${JSON.stringify(item.md)}`;
    output += ' }';
    if (ii < group.items.length - 1) output += ',';
    output += '\n';
  });
  output += '    ]\n';
  output += '  }';
  if (gi < docs.length - 1) output += ',';
  output += '\n';
});
output += '];\n';

fs.writeFileSync(path.join(docDir, 'index', 'docs.js'), output, 'utf-8');
console.log('docs.js 已生成，共 ' + docs.reduce((n, g) => n + g.items.length, 0) + ' 篇文档');
