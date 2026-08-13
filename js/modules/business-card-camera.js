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
      return '相機權限未開啟，請到 Android 的 LINE 權限設定允許使用相機後再試。';
    }
    if (error?.name === 'NotFoundError') return '找不到可用的相機。';
    if (error?.name === 'NotReadableError') return '相機正被其他程式使用，請關閉其他相機程式後再試。';
    return '目前無法開啟相機，請更新 LINE 後重試，或改用相簿上傳。';
  }

  window.openBusinessCardCamera = async function(target, event) {
    event?.preventDefault?.();
    if (state.opening || state.capturing) return;
    state.target = target === 'mycard' ? 'mycard' : 'collected';
    const requestId = ++state.requestId;

    const modal = element('business-card-camera-modal');
    const video = element('business-card-camera-video');
    if (!modal || !video) return;

    stopStream();
    state.opening = true;
    setShutterEnabled(false);
    setStatus('正在開啟後鏡頭…', false);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');

    if (!navigator.mediaDevices?.getUserMedia) {
      state.opening = false;
      setStatus('此版本的 LINE 瀏覽器不支援頁內相機，請更新 LINE 後再試，或改用相簿上傳。', true);
      return;
    }

    try {
      const stream = await requestRearCamera();
      if (requestId !== state.requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.stream = stream;
      video.srcObject = state.stream;
      await video.play();
      setStatus('後鏡頭已開啟，對準名片後按下拍攝鍵', false);
      setShutterEnabled(true);
    } catch (error) {
      stopStream();
      setStatus(cameraErrorMessage(error), true);
      window.showToast?.(cameraErrorMessage(error), true);
    } finally {
      state.opening = false;
    }
  };

  window.closeBusinessCardCamera = function() {
    state.requestId += 1;
    stopStream();
    state.opening = false;
    state.capturing = false;
    setShutterEnabled(false);
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
      window.showToast?.(error?.message || '拍攝失敗，請重新拍攝', true);
    }
  };

  window.addEventListener('pagehide', stopStream);
})();
