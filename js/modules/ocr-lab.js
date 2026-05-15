(function() {
  'use strict';

  var state = {
    fileDataUrl: '',
    sourceImage: null,
    enhancedDataUrl: '',
    enhancedBlobSize: 0
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
    $('ocr-lab-login').addEventListener('click', loginLiff);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
