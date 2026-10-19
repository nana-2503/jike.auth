const fs = require('fs');
const path = require('path');

const docs = [
  {
    group: '快速开始',
    items: [
      { id: 'overview', title: '接口总览', file: 'README.md' },
    ]
  },
  {
    group: '应用',
    items: [
      { id: 'apps-list', title: '查询应用列表', file: '查询应用列表.md' },
      { id: 'apps-get', title: '查询指定应用', file: '查询指定应用.md' },
    ]
  },
  {
    group: '卡种',
    items: [
      { id: 'cardtypes-list', title: '查询卡种列表', file: '查询卡种列表.md' },
      { id: 'cardtypes-get', title: '查询指定卡种', file: '查询指定卡种.md' },
    ]
  },
  {
    group: '卡号',
    items: [
      { id: 'cards-list', title: '查询卡号列表', file: '查询卡号列表.md' },
      { id: 'cards-get', title: '查询指定卡号', file: '查询指定卡号.md' },
    ]
  },
  {
    group: '用户',
    items: [
      { id: 'users-list', title: '查询用户列表', file: '查询用户列表.md' },
      { id: 'users-get', title: '查询指定用户', file: '查询指定用户.md' },
    ]
  },
];

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

const indexDir = path.join(docDir, 'index');
if (!fs.existsSync(indexDir)) fs.mkdirSync(indexDir);
fs.writeFileSync(path.join(indexDir, 'docs.js'), output, 'utf-8');
console.log('docs.js 已生成，共 ' + docs.reduce((n, g) => n + g.items.length, 0) + ' 篇文档');
