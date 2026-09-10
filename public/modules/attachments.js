/**
 * modules/attachments.js -- 附件目录加载
 * 三种方式加载附件：
 *  1. 拖拽文件夹 → 后端根据文件夹名搜索本地路径 → 直接用本地路径发送（不复制文件）
 *  2. 点击"选择"按钮 → 后端 folderpicker.exe 弹出系统对话框 → 直接用本地路径发送
 *  3. 输入/粘贴路径 → 回车自动扫描
 */

function initAttachments() {
  var pathInput = $('attach-path-input');
  var dropZone = $('attach-drop-zone');

  // ---- 1. 选择按钮 → 后端 folderpicker.exe ----
  var browseBtn = $('attach-browse-btn');
  browseBtn.addEventListener('click', async function() {
    $('status-text').textContent = '请选择附件根目录...';
    browseBtn.disabled = true;
    try {
      var resp = await fetch('/api/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      var data = await resp.json();
      if (!resp.ok) {
        $('status-text').textContent = '选择文件夹失败: ' + (data.error || '');
        showResultDialog('选择失败', data.error || '选择文件夹失败');
        return;
      }
      if (!data.folderPath) {
        $('status-text').textContent = '已取消选择文件夹';
        return;
      }
      pathInput.value = data.folderPath;
      state.attachMode = 'local';
      scanAttachmentsLocal(data.folderPath);
    } catch (e) {
      $('status-text').textContent = '选择文件夹失败: ' + e.message;
      showResultDialog('选择失败', '选择文件夹失败: ' + e.message);
    } finally {
      browseBtn.disabled = false;
    }
  });

  // ---- 2. 输入/粘贴路径 → 回车自动扫描 ----
  pathInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var p = pathInput.value.trim();
      if (p) {
        state.attachMode = 'local';
        scanAttachmentsLocal(p);
      }
    }
  });

  pathInput.addEventListener('paste', function() {
    setTimeout(function() {
      var p = pathInput.value.trim();
      if (p) {
        state.attachMode = 'local';
        scanAttachmentsLocal(p);
      }
    }, 0);
  });

  pathInput.addEventListener('blur', function() {
    var p = pathInput.value.trim();
    if (p && p !== state.attachRoot) {
      state.attachMode = 'local';
      scanAttachmentsLocal(p);
    }
  });

  // ---- 3. 拖拽文件夹 → 上传到后端 ----
  if (dropZone) {
    var dragCounter = 0;

    dropZone.addEventListener('dragenter', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });

    dropZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropZone.classList.remove('dragover');
      }
    });

    dropZone.addEventListener('drop', async function(e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      dropZone.classList.remove('dragover');

      var items = e.dataTransfer.items;
      if (!items || items.length === 0) return;

      // 优先尝试从 DataTransfer 获取真实路径（部分浏览器/版本支持）
      var realPath = null;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        var f = e.dataTransfer.files[0];
        if (f && f.path && f.path.trim()) {
          realPath = f.path.trim();
        }
      }
      if (!realPath) {
        for (var j = 0; j < items.length; j++) {
          try {
            var asFile = items[j].getAsFile();
            if (asFile && asFile.path && asFile.path.trim()) {
              realPath = asFile.path.trim();
              break;
            }
          } catch (ex) {}
        }
      }

      if (realPath) {
        pathInput.value = realPath;
        state.attachMode = 'local';
        scanAttachmentsLocal(realPath);
        return;
      }

      // 浏览器不给真实路径，只能拿到文件夹名
      var folderEntry = null;
      for (var i = 0; i < items.length; i++) {
        var entry = null;
        if (items[i].webkitGetAsEntry) {
          entry = items[i].webkitGetAsEntry();
        }
        if (entry && entry.isDirectory) {
          folderEntry = entry;
          break;
        }
      }

      if (!folderEntry) {
        $('status-text').textContent = '请拖拽文件夹，不是文件';
        return;
      }

      var folderName = folderEntry.name;
      $('status-text').textContent = '正在定位文件夹: ' + folderName;
      pathInput.value = '';

      try {
        // 调后端搜索同名文件夹的真实路径
        var resp = await fetch('/api/resolve-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderName: folderName }),
        });
        var data = await resp.json();
        if (!resp.ok) {
          $('status-text').textContent = data.error || '未找到该文件夹';
          showResultDialog('未找到文件夹', data.error || '请使用"选择"按钮手动指定文件夹路径');
          return;
        }
        if (!data.folderPath) {
          $('status-text').textContent = '未找到文件夹: ' + folderName + '，请用"选择"按钮手动指定';
          return;
        }

        pathInput.value = data.folderPath;
        state.attachMode = 'local';
        scanAttachmentsLocal(data.folderPath);
      } catch (err) {
        $('status-text').textContent = '定位文件夹失败: ' + err.message;
        showResultDialog('定位失败', '定位文件夹失败: ' + err.message);
      }
    });
  }
}

// ====== 本地路径扫描（选择按钮 / 手动输入）======
async function scanAttachmentsLocal(folderPath) {
  $('status-text').textContent = '正在扫描附件目录...';
  try {
    var resp = await fetch('/api/scan-attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: folderPath }),
    });
    var data = await resp.json();
    if (!resp.ok) {
      $('status-text').textContent = '扫描失败: ' + (data.error || '未知错误');
      showResultDialog('扫描失败', data.error || '扫描失败');
      return;
    }

    state.attachmentsMap = data.depts || {};
    state.attachRoot = folderPath;
    state.attachMode = 'local';

    updateAttachStatus();
    updateRecipientList();
    updatePreview();
  } catch (e) {
    $('status-text').textContent = '扫描失败: ' + e.message;
    showResultDialog('扫描失败', '扫描失败: ' + e.message);
  }
}

// ====== 兼容旧调用 ======

function updateAttachStatus() {
  var matchedDepts = state.deptOrder.filter(function(d) {
    return state.attachmentsMap[d] && state.attachmentsMap[d].length;
  });
  var totalFiles = matchedDepts.reduce(function(sum, d) {
    return sum + state.attachmentsMap[d].length;
  }, 0);
  if (matchedDepts.length > 0) {
    $('status-text').textContent =
      '已加载附件: ' + matchedDepts.length + ' 个部门, ' + totalFiles + ' 个文件';
  } else if (state.attachRoot) {
    $('status-text').textContent =
      '附件目录已加载，但未匹配到任何部门子目录（请确认子文件夹名与部门名一致）';
  }
}

/**
 * 获取附件文件名列表（用于 tooltip）
 */
function getAttachNames(dept) {
  var files = state.attachmentsMap[dept] || [];
  return files.map(function(f) { return f.name; });
}
