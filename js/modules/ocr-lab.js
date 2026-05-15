(function() {
  'use strict';

  var state = {
    fileDataUrl: '',
    sourceImage: null,
    enhancedDataUrl: '',
    enhancedBlobSize: 0,
    ocrCard: null,
    redrawDataUrl: ''
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    button.disabled = !!busy;
    if (text) button.innerHTML = text;
  }

  function bytesToText(bytes) {
    if (!bytes) return '-';
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  function loadImage(dataUrl) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result || '')); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function clamp(value) {
    return Math.max(0, Math.min(255, value));
  }

  function getPercentile(histogram, total, percentile) {
    var target = total * percentile;
    var acc = 0;
    for (var i = 0; i < histogram.length; i++) {
      acc += histogram[i];
      if (acc >= target) return i;
    }
    return 255;
  }

  function makeCanvasFromImage(img, maxSide) {
    var scale = Math.min(1, Number(maxSide || 1800) / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  function enhanceCanvas(canvas, options) {
    var mode = options.mode || 'balanced';
    var contrast = Number(options.contrast || 115) / 100;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var histogram = new Uint32Array(256);

    for (var i = 0; i < data.length; i += 4) {
      var luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[clamp(luma)]++;
    }

    var total = data.length / 4;
    var low = getPercentile(histogram, total, mode === 'text' ? 0.015 : 0.02);
    var high = getPercentile(histogram, total, mode === 'text' ? 0.992 : 0.985);
    var range = Math.max(48, high - low);
    var mix = mode === 'text' ? 0.9 : 0.68;
    var saturation = mode === 'text' ? 0.08 : 0.72;

    for (var p = 0; p < data.length; p += 4) {
      var r = data[p];
      var g = data[p + 1];
      var b = data[p + 2];
      var l = 0.299 * r + 0.587 * g + 0.114 * b;
      var leveled = clamp(((l - low) / range) * 255);
      var adjusted = clamp((leveled - 128) * contrast + 128);

      if (mode === 'text') {
        var threshold = adjusted > 176 ? 255 : (adjusted < 78 ? 24 : adjusted);
        data[p] = threshold;
        data[p + 1] = threshold;
        data[p + 2] = threshold;
      } else {
        data[p] = clamp((r * saturation + adjusted * (1 - saturation)) * (1 - mix) + adjusted * mix);
        data[p + 1] = clamp((g * saturation + adjusted * (1 - saturation)) * (1 - mix) + adjusted * mix);
        data[p + 2] = clamp((b * saturation + adjusted * (1 - saturation)) * (1 - mix) + adjusted * mix);
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function canvasToJpeg(canvas) {
    var quality = 0.86;
    var dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 900000 && quality > 0.48) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }

  function estimateDataUrlBytes(dataUrl) {
    var base64 = String(dataUrl || '').split(',')[1] || '';
    return Math.round(base64.length * 0.75);
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    var text = value.trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  function readFirst(source, keys) {
    if (!source || typeof source !== 'object') return '';
    for (var i = 0; i < keys.length; i++) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }

  function findOcrPayload(res) {
    var queue = [res];
    var seen = [];
    while (queue.length) {
      var item = queue.shift();
      if (!item) continue;
      if (seen.indexOf(item) >= 0) continue;
      if (typeof item === 'object') seen.push(item);

      var parsed = parseMaybeJson(item);
      if (parsed && parsed !== item) {
        queue.push(parsed);
        continue;
      }

      if (typeof item !== 'object') continue;
      if (readFirst(item, ['姓名', 'name', 'title', '公司名稱', 'company', '手機號碼', 'phone'])) {
        return item;
      }

      var nextKeys = ['data', 'cardData', 'card', 'result', 'payload', 'ocr', 'fields', '名片設定', '自訂名片設定'];
      for (var i = 0; i < nextKeys.length; i++) {
        if (item[nextKeys[i]] !== undefined) queue.push(item[nextKeys[i]]);
      }
    }
    return {};
  }

  function normalizeOcrCard(res) {
    var card = findOcrPayload(res);
    var settingsRaw = card && (card['自訂名片設定'] || card.cardSettings || card.settings);
    var settings = parseMaybeJson(settingsRaw) || (settingsRaw && typeof settingsRaw === 'object' ? settingsRaw : {});
    var buttons = Array.isArray(settings.buttons) ? settings.buttons : [];

    function fromButton(labelPattern) {
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i] || {};
        var label = String(button.l || button.label || '');
        if (labelPattern.test(label)) return String(button.u || button.uri || '').trim();
      }
      return '';
    }

    return {
      name: readFirst(card, ['姓名', 'name', 'title']) || readFirst(settings, ['title', 'name']),
      englishName: readFirst(card, ['英文名', 'englishName', 'english_name']),
      title: readFirst(card, ['職稱', 'jobTitle', 'position']),
      department: readFirst(card, ['部門', 'department']),
      company: readFirst(card, ['公司名稱', 'company', 'organization']),
      taxId: readFirst(card, ['統一編號', 'taxId', 'tax_id']),
      mobile: readFirst(card, ['手機號碼', '手機', 'mobile', 'cellphone']) || fromButton(/手機|行動|phone/i).replace(/^tel:/i, ''),
      phone: readFirst(card, ['公司電話', '電話', 'phone', 'tel']) || fromButton(/電話|撥打|call/i).replace(/^tel:/i, ''),
      email: readFirst(card, ['電子郵件', 'Email', 'email']) || fromButton(/郵件|email/i).replace(/^mailto:/i, ''),
      website: readFirst(card, ['公司網址', '網址', 'website', 'url']),
      address: readFirst(card, ['公司地址', '地址', 'address']),
      lineId: readFirst(card, ['LINE ID', 'lineId', 'line_id']),
      service: readFirst(card, ['服務項目', '服務說明', '服務項目說明', 'desc', 'description']) || readFirst(settings, ['desc', 'description'])
    };
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.save();
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text || '').replace(/\s+/g, ' ').trim().split('');
    var line = '';
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
      if (maxLines && lines.length >= maxLines) break;
    }
    if ((!maxLines || lines.length < maxLines) && line) lines.push(line);
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, y + j * lineHeight);
    }
    return y + lines.length * lineHeight;
  }

  function splitServiceLines(card) {
    var text = String(card.service || '').trim();
    if (!text) {
      var pieces = [];
      if (card.company) pieces.push(card.company);
      if (card.title) pieces.push(card.title);
      if (card.department) pieces.push(card.department);
      text = pieces.join(' / ');
    }
    return text
      .split(/\n|、|\/|，|,/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean)
      .slice(0, 5);
  }

  function renderRedrawnCard() {
    if (!state.ocrCard) return;
    var canvas = $('ocr-lab-redraw-canvas');
    if (!canvas) return;

    var width = 1050;
    var height = 600;
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.aspectRatio = width + ' / ' + height;
    canvas.classList.remove('hidden');

    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var card = state.ocrCard;
    var accent = '#0f766e';
    var ink = '#102033';
    var muted = '#5f6f84';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    fillRoundRect(ctx, 0, 0, width, height, 0, '#ffffff');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, height - 92, width, 92);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 22, height);
    ctx.fillRect(0, height - 106, width, 10);

    ctx.fillStyle = ink;
    ctx.font = '700 34px "Noto Sans TC", sans-serif';
    drawWrappedText(ctx, card.company || '公司名稱', 70, 74, 620, 42, 2);

    ctx.font = '900 62px "Noto Sans TC", sans-serif';
    ctx.fillText(card.name || '姓名', 70, 210);
    if (card.englishName) {
      ctx.font = '600 26px Inter, sans-serif';
      ctx.fillStyle = muted;
      ctx.fillText(card.englishName, 74, 252);
    }

    var role = [card.title, card.department].filter(Boolean).join(' / ');
    if (role) {
      ctx.font = '700 30px "Noto Sans TC", sans-serif';
      ctx.fillStyle = accent;
      drawWrappedText(ctx, role, 72, 306, 420, 36, 2);
    }

    var serviceLines = splitServiceLines(card);
    ctx.font = '500 28px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#d32f2f';
    var serviceY = role ? 384 : 324;
    serviceLines.forEach(function(line, index) {
      drawWrappedText(ctx, line, 74, serviceY + index * 38, 440, 34, 1);
    });

    fillRoundRect(ctx, 594, 80, 386, 344, 24, '#f8fafc');
    ctx.font = '800 25px "Noto Sans TC", sans-serif';
    ctx.fillStyle = ink;
    ctx.fillText('聯絡資訊', 632, 132);

    var rows = [
      ['手機', card.mobile],
      ['電話', card.phone],
      ['Email', card.email],
      ['地址', card.address],
      ['統編', card.taxId]
    ].filter(function(row) { return row[1]; });

    var y = 184;
    rows.slice(0, 5).forEach(function(row) {
      ctx.font = '700 22px "Noto Sans TC", sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(row[0], 632, y);
      ctx.font = '600 23px "Noto Sans TC", sans-serif';
      ctx.fillStyle = ink;
      y = drawWrappedText(ctx, row[1], 700, y, 240, 30, row[0] === '地址' ? 2 : 1) + 12;
    });

    ctx.font = '700 24px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, 70, 510, 250, 56, 16, accent);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.mobile ? '撥打手機' : '交換名片', 132, 546);

    if (card.website || card.lineId) {
      fillRoundRect(ctx, 340, 510, 250, 56, 16, '#2563eb');
      ctx.fillStyle = '#ffffff';
      ctx.fillText(card.website ? '查看網站' : '加入好友', 402, 546);
    }

    state.redrawDataUrl = canvas.toDataURL('image/png');
    var info = $('ocr-lab-redraw-info');
    if (info) info.textContent = width + ' x ' + height + ' / ' + bytesToText(estimateDataUrlBytes(state.redrawDataUrl));
    var download = $('ocr-lab-download-redraw');
    if (download) download.disabled = false;
  }

  async function renderEnhanced() {
    if (!state.sourceImage) return;
    var mode = $('ocr-lab-mode').value;
    var maxSide = Number($('ocr-lab-max-side').value || 1800);
    var contrast = Number($('ocr-lab-contrast').value || 115);
    var canvas = makeCanvasFromImage(state.sourceImage, maxSide);
    enhanceCanvas(canvas, { mode: mode, contrast: contrast });
    state.enhancedDataUrl = canvasToJpeg(canvas);
    state.enhancedBlobSize = estimateDataUrlBytes(state.enhancedDataUrl);

    var enhanced = $('ocr-lab-enhanced');
    enhanced.src = state.enhancedDataUrl;
    enhanced.classList.remove('hidden');
    $('ocr-lab-enhanced-info').textContent = canvas.width + ' x ' + canvas.height + ' / ' + bytesToText(state.enhancedBlobSize);
    $('ocr-lab-recognize').disabled = false;
  }

  async function handleFile(file) {
    if (!file) return;
    state.fileDataUrl = await readFileAsDataUrl(file);
    state.sourceImage = await loadImage(state.fileDataUrl);
    var original = $('ocr-lab-original');
    original.src = state.fileDataUrl;
    original.classList.remove('hidden');
    $('ocr-lab-original-info').textContent = (state.sourceImage.naturalWidth || state.sourceImage.width) + ' x ' + (state.sourceImage.naturalHeight || state.sourceImage.height) + ' / ' + bytesToText(file.size);
    state.ocrCard = null;
    state.redrawDataUrl = '';
    var redrawCanvas = $('ocr-lab-redraw-canvas');
    if (redrawCanvas) redrawCanvas.classList.add('hidden');
    $('ocr-lab-redraw-info').textContent = '等待 OCR';
    $('ocr-lab-redraw-button').disabled = true;
    $('ocr-lab-download-redraw').disabled = true;
    $('ocr-lab-run').disabled = false;
    $('ocr-lab-result').textContent = '已載入圖片。請比較右側修正版，或直接測 OCR。';
    await renderEnhanced();
  }

  async function loginLiff() {
    try {
      if (typeof window.initActmasterLiff === 'function') {
        await window.initActmasterLiff(window.LIFF_ID || window.Config.LIFF_ID, { withLoginOnExternalBrowser: false });
      }
      if (window.liff && !window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      window.showToast && window.showToast('LIFF 已登入或可用');
    } catch (err) {
      window.showToast && window.showToast('LIFF 初始化失敗：' + (err.message || err), true);
    }
  }

  async function recognizeEnhanced() {
    if (!state.enhancedDataUrl) return;
    var btn = $('ocr-lab-recognize');
    var oldHtml = btn.innerHTML;
    setBusy(btn, true, '<span class="material-symbols-outlined">hourglass_top</span> OCR 測試中');
    $('ocr-lab-result').textContent = '正在送出修正版圖片，不會儲存名片...';

    try {
      if (typeof window.initActmasterLiff === 'function' && window.liff) {
        await window.initActmasterLiff(window.LIFF_ID || window.Config.LIFF_ID, { withLoginOnExternalBrowser: false }).catch(function() {});
      }
      var res = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image: state.enhancedDataUrl }, true);
      $('ocr-lab-result').textContent = JSON.stringify(res, null, 2);
      state.ocrCard = normalizeOcrCard(res);
      $('ocr-lab-redraw-button').disabled = false;
      renderRedrawnCard();
      window.showToast && window.showToast('OCR 測試完成');
    } catch (err) {
      $('ocr-lab-result').textContent = 'OCR 測試失敗：\n' + (err.message || err);
      window.showToast && window.showToast('OCR 測試失敗：' + (err.message || err), true);
    } finally {
      btn.innerHTML = oldHtml;
      btn.disabled = false;
    }
  }

  function bind() {
    var fileInput = $('ocr-lab-file');
    fileInput.addEventListener('change', function(evt) {
      handleFile(evt.target.files && evt.target.files[0]).catch(function(err) {
        $('ocr-lab-result').textContent = '讀圖失敗：\n' + (err.message || err);
      });
    });

    $('ocr-lab-run').addEventListener('click', function() {
      renderEnhanced().catch(function(err) {
        $('ocr-lab-result').textContent = '產生修正版失敗：\n' + (err.message || err);
      });
    });
    $('ocr-lab-mode').addEventListener('change', function() { if (state.sourceImage) renderEnhanced(); });
    $('ocr-lab-max-side').addEventListener('change', function() { if (state.sourceImage) renderEnhanced(); });
    $('ocr-lab-contrast').addEventListener('input', function(evt) {
      $('ocr-lab-contrast-value').textContent = evt.target.value + '%';
    });
    $('ocr-lab-contrast').addEventListener('change', function() { if (state.sourceImage) renderEnhanced(); });
    $('ocr-lab-recognize').addEventListener('click', recognizeEnhanced);
    $('ocr-lab-redraw-button').addEventListener('click', function() {
      if (!state.ocrCard) {
        window.showToast && window.showToast('請先完成 OCR 解析', true);
        return;
      }
      renderRedrawnCard();
    });
    $('ocr-lab-download-redraw').addEventListener('click', function() {
      if (!state.redrawDataUrl) return;
      var link = document.createElement('a');
      link.href = state.redrawDataUrl;
      link.download = 'redrawn-business-card.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    $('ocr-lab-login').addEventListener('click', loginLiff);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
