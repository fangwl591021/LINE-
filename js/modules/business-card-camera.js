(function() {
  const state = {
    stream: null,
    target: 'collected',
    opening: false,
    capturing: false,
    requestId: 0
  };

  function element(id) {
    return document.getElementById(id);
  }

  function isAndroidLineClient() {
    const userAgent = String(navigator.userAgent || '');
    const isAndroid = /Android/i.test(userAgent);
    const isLine = Boolean(window.liff?.isInClient?.()) || /\bLine\/[\d.]+/i.test(userAgent);
    return isAndroid && isLine;
  }

  function cameraInput(target) {
    return element(target === 'mycard' ? 'myCameraInput' : 'cameraInput');
  }

  function galleryInput(target) {
    return element(target === 'mycard' ? 'myGalleryInput' : 'galleryInput');
  }

  function setStatus(message, isError) {
    const status = element('business-card-camera-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.classList.toggle('bg-red-700/90', Boolean(isError));
    status.classList.toggle('bg-black/70', !isError);
  }

  function setShutterEnabled(enabled) {
    const shutter = element('business-card-camera-shutter');
    if (shutter) shutter.disabled = !enabled;
  }

  function showErrorActions(show, canRetry) {
    const actions = element('business-card-camera-error-actions');
    const retry = element('business-card-camera-retry');
    if (actions) {
      actions.classList.toggle('hidden', !show);
      actions.classList.toggle('grid', show);
    }
    if (retry) retry.classList.toggle('hidden', show && !canRetry);
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    const video = element('business-card-camera-video');
    if (video) video.srcObject = null;
  }

  async function requestRearCamera() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
    } catch (error) {
      if (!['OverconstrainedError', 'NotFoundError'].includes(error?.name)) throw error;
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
    }
  }

  function cameraErrorMessage(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      return '相機尚未允許。請按「重新開啟」，並在系統提示選擇「允許」。';
    }
    if (error?.name === 'NotFoundError') return '找不到可用的相機，您可以改用相簿上傳。';
    if (error?.name === 'NotReadableError') return '相機正被其他程式使用，請關閉其他相機程式後重新開啟。';
    return '目前無法開啟相機，請重新開啟或改用相簿。';
  }

  async function startAndroidLiffCamera() {
    if (state.opening || state.capturing) return;
    const requestId = ++state.requestId;
    const video = element('business-card-camera-video');
    if (!video) return;

    stopStream();
    state.opening = true;
    setShutterEnabled(false);
    showErrorActions(false, true);
    setStatus('正在開啟後鏡頭；首次使用請在系統提示選擇「允許」…', false);

    if (!navigator.mediaDevices?.getUserMedia) {
      state.opening = false;
      setStatus('此版本的 LINE 不支援頁內相機，請改用相簿上傳。', true);
      showErrorActions(true, false);
      return;
    }

    try {
      const stream = await requestRearCamera();
      if (requestId !== state.requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.stream = stream;
      video.srcObject = stream;
      await video.play();
      setStatus('後鏡頭已開啟，對準名片後按下拍攝鍵', false);
      setShutterEnabled(true);
    } catch (error) {
      stopStream();
      setStatus(cameraErrorMessage(error), true);
      showErrorActions(true, !['NotFoundError'].includes(error?.name));
    } finally {
      state.opening = false;
    }
  }

  window.openBusinessCardCamera = function(target, event) {
    event?.preventDefault?.();
    state.target = target === 'mycard' ? 'mycard' : 'collected';

    if (!isAndroidLineClient()) {
      cameraInput(state.target)?.click();
      return;
    }

    const modal = element('business-card-camera-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    startAndroidLiffCamera();
  };

  window.retryBusinessCardCamera = function() {
    startAndroidLiffCamera();
  };

  window.useBusinessCardGallery = function() {
    const input = galleryInput(state.target);
    window.closeBusinessCardCamera();
    input?.click();
  };

  window.closeBusinessCardCamera = function() {
    state.requestId += 1;
    stopStream();
    state.opening = false;
    state.capturing = false;
    setShutterEnabled(false);
    showErrorActions(false, true);
    const modal = element('business-card-camera-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    document.body.classList.remove('overflow-hidden');
  };

  window.captureBusinessCardPhoto = async function() {
    const video = element('business-card-camera-video');
    if (!video || state.capturing || !state.stream || !video.videoWidth || !video.videoHeight) return;

    state.capturing = true;
    setShutterEnabled(false);
    setStatus('正在擷取名片照片…', false);
    try {
      const maxSide = 2200;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('無法建立相機影像');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('拍攝失敗')), 'image/jpeg', 0.92);
      });
      const target = state.target;
      window.closeBusinessCardCamera();
      const virtualInput = { files: [blob], value: '' };
      if (target === 'mycard') window.recognizeMyCard?.(virtualInput);
      else window.recognizeCard?.(virtualInput);
    } catch (error) {
      state.capturing = false;
      setShutterEnabled(Boolean(state.stream));
      setStatus(error?.message || '拍攝失敗，請重新拍攝', true);
    }
  };

  window.addEventListener('pagehide', stopStream);
})();
