/**
 * modules/dialog.js -- 自定义对话框（全局通用模块）
 * showConfirm: 确认对话框，返回 Promise<boolean>
 * showResult: 结果对话框（带可选详情）
 * showResultDialog: showResult 的简写（省略 detail 参数）
 */

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
 */
function showResult(title, msg, detail) {
  $('result-title').textContent = title;
  $('result-msg').textContent = msg;
  var detailEl = $('result-detail');
  if (detail) {
    detailEl.textContent = detail;
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
