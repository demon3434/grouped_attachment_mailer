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
      var _foreColorPicked = false;  // 用户是否从色板选过字体颜色
      var _bgColorPicked = false;    // 用户是否从色板选过底色

      editor.on('init', function() {
        editor.setContent('<p><br></p>');

        // 设置工具栏颜色按钮图标：字体颜色红色、底色黄色
        // 按钮名称是 forecolor / backcolor（不是 hilitecolor）
        editor.fire('TextColorChange', { name: 'forecolor', color: '#FF0000' });
        editor.fire('TextColorChange', { name: 'backcolor', color: '#FFFF00' });

        // 之后用户从色板选色时，记录标志位
        editor.on('TextColorChange', function(e) {
          if (e.name === 'forecolor') _foreColorPicked = true;
          if (e.name === 'backcolor') _bgColorPicked = true;
        });

        // 拦截颜色应用命令：用户点按钮时 lastColor 仍是默认黑色 #000000，
        // 在用户从色板选过其他颜色之前，替换为红/黄
        editor.addCommand('mceApplyTextcolor', function(format, value) {
          if (format === 'forecolor' && value === '#000000' && !_foreColorPicked) {
            value = '#FF0000';
          } else if (format === 'hilitecolor' && value === '#000000' && !_bgColorPicked) {
            value = '#FFFF00';
          }
          editor.undoManager.transact(function () {
            editor.focus();
            editor.formatter.apply(format, { value: value });
            editor.nodeChanged();
          });
        });
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
