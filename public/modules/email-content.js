/**
 * modules/email-content.js -- 邮件标题与富文本正文（TinyMCE 5 版本）
 * 自托管 TinyMCE 5 Community Edition，离线可用，无外部依赖
 */

var _tinymceEditor = null;

function initEmailContent() {
  if (typeof tinymce === 'undefined') {
    setTimeout(initEmailContent, 100);
    return;
  }

  // 检查中文语言文件是否存在，不存在则用默认英文
  var langConfig = {};
  var xhr = new XMLHttpRequest();
  xhr.open('HEAD', 'vendor/tinymce/langs/zh_CN.js', false);
  try {
    xhr.send();
    if (xhr.status === 200) {
      langConfig = { language: 'zh_CN', language_url: 'vendor/tinymce/langs/zh_CN.js' };
    }
  } catch (e) {}

  tinymce.init(Object.assign({
    selector: '#body-editor',
    skin: 'oxide',
    content_css: 'vendor/tinymce/skins/content/default/content.min.css',
    height: 300,
    menubar: false,
    statusbar: false,
    branding: false,
    promotion: false,
    plugins: 'lists link image table paste textcolor colorpicker hr charmap',
    toolbar: [
      'bold italic underline strikethrough | fontselect fontsizeselect | forecolor backcolor | removeformat',
      'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image table hr charmap'
    ],
    font_formats: '宋体=宋体;微软雅黑=微软雅黑;楷体=楷体;黑体=黑体;隶书=隶书;仿宋=仿宋;Arial=Arial;Times New Roman=Times New Roman;Courier New=Courier New',
    fontsize_formats: '10px 12px 14px 16px 18px 24px 36px',
    paste_data_images: true,
    paste_remove_styles: true,
    paste_strip_class_attributes: 'all',
    paste_remove_spans: true,
    setup: function(editor) {
      editor.on('init', function() {
        editor.setContent('<p><br></p>');
      });
    }
  }, langConfig)).then(function(editors) {
    if (editors && editors.length > 0) {
      _tinymceEditor = editors[0];
    }
  });
}

function getSubject() {
  return $('subject-input').value.trim();
}

function getBodyHTML() {
  if (_tinymceEditor) {
    return _tinymceEditor.getContent();
  }
  // fallback: textarea 原始值
  var ta = document.getElementById('body-editor');
  return ta ? ta.value : '';
}

function getBodyText() {
  if (_tinymceEditor) {
    return _tinymceEditor.getContent({ format: 'text' }).trim();
  }
  var ta = document.getElementById('body-editor');
  return ta ? ta.value.trim() : '';
}
