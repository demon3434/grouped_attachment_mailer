/**
 * app.js -- 前端主协调模块
 * 管理全局状态，初始化各模块，协调模块间通信
 */

// ====== 全局状态 ======
const state = {
  config: null,
  recipients: [],       // [{dept, group, name, email}]
  deptOrder: [],        // 去重部门列表（Excel顺序）
  groupOrder: [],        // 去重分组列表（Excel顺序）
  deptFilters: {},      // {部门: boolean}
  groupFilters: {},      // {分组: boolean}
  groupTypes: {},        // {分组: "收件人"|"抄送"}
  personChecks: {},     // {原始索引: boolean}
  attachmentsMap: {},   // {部门: [{name, fullPath, size}]}
  attachRoot: null,
  sending: false,
};

// ====== DOM 引用 ======
const $ = (id) => document.getElementById(id);

// ====== 初始化 ======
async function init() {
  // 页面加载时取消延迟关闭（区分刷新和关闭标签页）
  // 刷新场景：beforeunload 触发 before-close（3秒延迟关闭）→ 新页面加载 → 取消关闭
  // 关闭场景：beforeunload 触发 before-close → 无新页面取消 → 3秒后服务退出
  try {
    await fetch('/api/cancel-shutdown', { method: 'POST' });
  } catch (e) {
    // 服务器可能尚未启动，忽略
  }

  // 初始化各模块
  initConfig();
  initRecipients();
  initFilters();
  initRecipientList();
  initAttachments();
  initEmailContent();
  initPreview();
  initSend();

  // 加载配置
  await loadConfig();

  // 自动加载收件人名单
  await loadDefaultRecipients();
}

// ====== 启动 ======
window.addEventListener('DOMContentLoaded', init);

// ====== 全局阻止拖拽默认行为（防止浏览器打开文件夹/文件）======
// 只 preventDefault 不 stopPropagation，让 dropZone 自己的监听器仍能触发
document.addEventListener('dragover', function(e) {
  e.preventDefault();
});
document.addEventListener('drop', function(e) {
  // 检查 drop 是否发生在拖拽区域内
  var target = e.target;
  var inDropZone = false;
  while (target) {
    if (target.id === 'attach-drop-zone' || target.id === 'recip-drop-zone') {
      inDropZone = true;
      break;
    }
    target = target.parentElement;
  }
  if (!inDropZone) {
    e.preventDefault();
  }
});
