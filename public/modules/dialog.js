/**
 * modules/dialog.js -- 自定义对话框（全局通用模块）
 * showConfirm: 确认对话框，返回 Promise<boolean>
 * showResult: 结果对话框（带可选详情）
 * showResultDialog: showResult 的简写（省略 detail 参数）
 */

/**
 * 关闭结果对话框（全局通用，支持阻止冒泡）
 */
function closeResultDialog(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  var d = document.getElementById('result-dialog');
  if (d) d.style.display = 'none';
}
window.closeResultDialog = closeResultDialog;

/**
 * 初始化对话框事件监听（关闭按钮、遮罩点击、Esc 快捷键）
 */
function initDialog() {
  var closeBtn = $('result-close-btn');
  if (closeBtn) {
    closeBtn.onclick = closeResultDialog;
  }
  var footerBtn = $('result-footer-close-btn');
  if (footerBtn) {
    footerBtn.onclick = closeResultDialog;
  }

  // 点击遮罩空白处直接关闭
  var resultOverlay = $('result-dialog');
  if (resultOverlay) {
    resultOverlay.onclick = function(e) {
      if (e.target === resultOverlay) {
        closeResultDialog(e);
      }
    };
  }

  // 监听 Esc 键关闭提示框
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (resultOverlay && resultOverlay.style.display !== 'none') {
        closeResultDialog(e);
      }
    }
  });
}

// 自动保底绑定（防止其他模块遗漏调用）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDialog);
} else {
  setTimeout(initDialog, 0);
}

/**
 * 显示确认对话框，返回 Promise<boolean>
 */
function showConfirm(title, msg, okText) {
  return new Promise(function(resolve) {
    $('confirm-title').textContent = title;
    $('confirm-msg').textContent = msg;
    var okBtn = $('confirm-ok-btn');
    var cancelBtn = $('confirm-cancel-btn');
    okBtn.textContent = okText || '确认';
    $('confirm-dialog').style.display = 'flex';

    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onOk() { cleanup(); $('confirm-dialog').style.display = 'none'; resolve(true); }
    function onCancel() { cleanup(); $('confirm-dialog').style.display = 'none'; resolve(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/**
 * 显示结果对话框
 * detail 可以是纯文本或 HTML 字符串
 * isHtml 为 true 时 detail 作为 HTML 渲染
 */
function showResult(title, msg, detail, isHtml) {
  $('result-title').textContent = title;
  $('result-msg').textContent = msg;
  var detailEl = $('result-detail');
  if (detail) {
    if (isHtml) {
      detailEl.innerHTML = detail;
    } else {
      detailEl.textContent = detail;
    }
    detailEl.style.display = 'block';
  } else {
    detailEl.style.display = 'none';
  }
  $('result-dialog').style.display = 'flex';
}

/**
 * showResult 的简写（省略 detail 参数）
 */
function showResultDialog(title, msg) {
  showResult(title, msg, null);
}
