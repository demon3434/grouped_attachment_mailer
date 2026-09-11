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
  ccSelf: false,         // 抄送自己开关
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
  initDialog();
  initConfig();
  initRecipients();
  initFilters();
  initRecipientList();
  initAttachments();
  initEmailContent();
  initPreview();
  initSend();
  initPanelResizer();

  // 加载配置
  await loadConfig();

  // 自动加载收件人名单
  await loadDefaultRecipients();
}

// ====== 启动 ======
window.addEventListener('DOMContentLoaded', init);

// ====== 左右面板拖拽调整宽度 ======
function initPanelResizer() {
  var resizer = $('panel-resizer');
  var leftPanel = $('left-panel');
  var main = $('main');
  var dragging = false;

  // 拖拽遮罩：盖住整个页面（含 iframe），防止 mouseup 被 TinyMCE iframe 吞掉
  var overlay = null;

  resizer.addEventListener('mousedown', function(e) {
    e.preventDefault();
    dragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // 创建透明遮罩
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;cursor:col-resize;';
    document.body.appendChild(overlay);
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var mainRect = main.getBoundingClientRect();
    var padding = 8;
    var resizerWidth = 8;
    var minX = 280;
    var maxX = mainRect.width - 280 - resizerWidth - padding * 2;
    var newLeftWidth = e.clientX - mainRect.left - padding;
    if (newLeftWidth < minX) newLeftWidth = minX;
    if (newLeftWidth > maxX) newLeftWidth = maxX;
    leftPanel.style.width = newLeftWidth + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (overlay) { overlay.parentNode.removeChild(overlay); overlay = null; }
  });
}

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
