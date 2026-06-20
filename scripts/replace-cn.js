const fs = require('fs');
const path = require('path');

// Target files
const files = [
  'src/cli/plugins.ts',
  'src/cli/adapters/marketplace.ts',
  'src/cli/adapters/commands.ts',
  'src/cli/adapters/custom-template.ts',
  'src/cli/adapters/manager.ts',
];

// Dictionary of Chinese → English replacements (exact matches only)
// Order matters: longer phrases first to avoid partial matches
const replacements = [
  // Phrases first
  { from: '已安装的插件', to: 'Installed plugins' },
  { from: '无插件', to: 'No plugins' },
  { from: 'Provider 插件', to: 'Provider plugins' },
  { from: 'Agent 插件', to: 'Agent plugins' },
  { from: 'Router 插件', to: 'Router plugins' },
  { from: '传统适配器 (遗留系统)', to: 'Legacy adapters (legacy system)' },
  { from: '从 GitHub 安装', to: 'Installing from GitHub' },
  { from: '从 npm 安装', to: 'Installing from npm' },
  { from: '安装成功', to: 'Installation successful' },
  { from: '使用: mc plugin list', to: 'Usage: mc plugin list' },
  { from: '安装失败', to: 'Installation failed' },
  { from: '错误', to: 'Error' },
  { from: '插件未找到', to: 'Plugin not found' },
  { from: '卸载插件', to: 'Uninstalling plugin' },
  { from: '卸载成功', to: 'Uninstall successful' },
  { from: '卸载失败', to: 'Uninstall failed' },
  { from: '重新加载插件系统', to: 'Reloading plugin system' },
  { from: '重新加载完成', to: 'Reload complete' },
  { from: '重新加载失败', to: 'Reload failed' },
  { from: '插件信息', to: 'Plugin info' },
  { from: '名称', to: 'Name' },
  { from: '版本', to: 'Version' },
  { from: '类型', to: 'Type' },
  { from: '描述', to: 'Description' },
  { from: '作者', to: 'Author' },
  { from: '协议', to: 'License' },
  { from: '来源', to: 'Source' },
  { from: '安装时间', to: 'Installed at' },
  { from: '标签', to: 'Tags' },
  { from: '支持的类型', to: 'Supported types' },
  { from: '插件市场', to: 'Plugin marketplace' },
  { from: '可用操作: list', to: 'Available operations: list' },
  { from: '从远程获取插件注册表', to: 'Fetching plugin registry from remote' },
  { from: '获取远程注册表失败', to: 'Failed to fetch remote registry' },
  { from: '插件市场', to: 'Plugin marketplace' },
  { from: '未找到匹配', to: 'No matching' },
  { from: '搜索结果', to: 'Search results' },
  { from: '未在市场中找到插件', to: 'Plugin not found in marketplace' },
  { from: '可用插件', to: 'Available plugins' },
  { from: '已安装', to: 'Installed' },
  { from: '安装', to: 'Installing' },
  { from: '依赖', to: 'Dependencies' },
  { from: '安装完成', to: 'Installation complete' },
  { from: '设置默认', to: 'Set as default' },
  { from: '添加市场', to: 'Adding marketplace' },
  { from: '无法获取远程注册表', to: 'Cannot fetch remote registry' },
  { from: '获取到', to: 'Fetched' },
  { from: '已添加市场', to: 'Marketplace added' },
  { from: '查看插件', to: 'View plugins' },
  { from: '刷新市场', to: 'Refreshing marketplace' },
  { from: '个插件', to: ' plugins' },
  { from: '市场刷新完成', to: 'Marketplace refresh complete' },
  { from: '未找到市场', to: 'Marketplace not found' },
  { from: '已移除市场', to: 'Marketplace removed' },
  { from: '已配置的市场', to: 'Configured marketplaces' },
  { from: '内置', to: 'Built-in' },
  { from: '官方市场', to: 'Official marketplace' },
  { from: '适配器', to: 'Adapter' },
  { from: '已存在', to: 'already exists' },
  { from: '已创建', to: 'Created' },
  { from: '未找到', to: 'Not found' },
  { from: '已删除', to: 'Deleted' },
  { from: '可用适配器', to: 'Available adapters' },
  { from: '类型', to: 'Type' },
  { from: '版本', to: 'Version' },
  { from: '已安装的适配器', to: 'Installed adapters' },
  { from: '无', to: 'None' },
  { from: '重新加载适配器', to: 'Reloading adapters' },
  { from: '无自定义适配器', to: 'No custom adapters' },
  { from: '找到', to: 'Found' },
  { from: '个自定义适配器', to: ' custom adapters' },
  { from: '总计', to: 'Total' },
  { from: '个适配器 (内置 + 自定义)', to: ' adapters (builtin + custom)' },
  { from: '适配器已重新加载', to: 'Adapters reloaded' },
  { from: '重新加载失败', to: 'Reload failed' },
  { from: '安装失败', to: 'Install failed' },
  { from: '卸载失败', to: 'Uninstall failed' },
  { from: '使用以下命令安装', to: 'Install using command' },
  { from: '请先卸载适配器', to: 'Please uninstall adapter first' },
  { from: '安装适配器', to: 'Installing adapter' },
  { from: '激活适配器', to: 'Activating adapter' },
  { from: '卸载适配器', to: 'Uninstalling adapter' },
  { from: '停用适配器', to: 'Deactivating adapter' },
  { from: '安装代理适配器', to: 'Installing proxy adapter' },
  { from: '代理适配器已激活', to: 'Proxy adapter activated' },
  { from: '默认路由', to: 'Default route' },
  { from: '已安装', to: 'Installed' },
  { from: '未安装', to: 'Not installed' },
  { from: '合并配置', to: 'Merging config' },
  { from: '跳过配置 (JSON 解析失败)', to: 'Skipping config (JSON parse failed)' },
  { from: '创建配置', to: 'Creating config' },
  { from: '移除配置', to: 'Removing config' },
  { from: '还有', to: 'more' },
  { from: '个', to: '' }, // Risky, but usually part of other phrases
  // Fix: 还有 ${legacyAdapters.length - 3} 个
  { from: '还有 ${legacyAdapters.length - 3} 个', to: '${legacyAdapters.length - 3} more' },
];

function isWithinConsoleLine(text, matchIndex, matchLength) {
  // Check if this is within a console.log/error/warn line
  const lines = text.split('\n');
  let pos = 0;
  for (const line of lines) {
    if (matchIndex >= pos && matchIndex < pos + line.length) {
      return /^\s*console\.(log|error|warn)/.test(line);
    }
    pos += line.length + 1;
  }
  return false;
}

for (const file of files) {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Only process content within console lines
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (/^\s*console\.(log|error|warn)/.test(line)) {
      let newLine = line;
      for (const { from, to } of replacements) {
        newLine = newLine.split(from).join(to);
      }
      return newLine;
    }
    return line;
  });

  const newContent = newLines.join('\n');
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✅ Updated: ${file}`);
  } else {
    console.log(`⏭️  No changes: ${file}`);
  }
}

console.log('\n✅ Batch replacement complete!');
