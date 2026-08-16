(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.cardVisionCrop = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const AUTO_CROP_CONFIDENCE = 0.72;

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function normalizeLocalization(value) {
    const source = value && typeof value === 'object' ? value : {};
    const box = source.boundingBox && typeof source.boundingBox === 'object' ? source.boundingBox : {};
    return {
      detected: source.detected === true,
      incomplete: source.incomplete === true,
      cropConfidence: clamp01(source.cropConfidence),
      boundingBox: {
        x: clamp01(box.x),
        y: clamp01(box.y),
        width: clamp01(box.width),
        height: clamp01(box.height)
      },
      corners: Array.isArray(source.corners)
        ? source.corners.slice(0, 4).map(point => ({ x: clamp01(point && point.x), y: clamp01(point && point.y) }))
        : [],
      clippedEdges: Array.isArray(source.clippedEdges)
        ? source.clippedEdges.filter(edge => ['left', 'right', 'top', 'bottom'].includes(edge)).slice(0, 4)
        : []
    };
  }

  function orderQuad(points) {
    if (!Array.isArray(points) || points.length !== 4) return points;
    const sums = points.map(point => point.x + point.y);
    const diffs = points.map(point => point.x - point.y);
    const indexOf = (values, compare) => values.reduce((best, value, index) => compare(value, values[best]) ? index : best, 0);
    const ordered = [
      points[indexOf(sums, (a, b) => a < b)],
      points[indexOf(diffs, (a, b) => a > b)],
      points[indexOf(sums, (a, b) => a > b)],
      points[indexOf(diffs, (a, b) => a < b)]
    ];
    if (new Set(ordered).size === 4) return ordered;
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
    const circular = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
    const start = circular.reduce((best, point, index) => point.x + point.y < circular[best].x + circular[best].y ? index : best, 0);
    return [...circular.slice(start), ...circular.slice(0, start)];
  }

  function solveLinear(matrix, vector) {
    const size = vector.length;
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let col = 0; col < size; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < size; row += 1) {
        if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
      }
      if (Math.abs(rows[pivot][col]) < 1e-10) return null;
      [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
      const divisor = rows[col][col];
      for (let index = col; index <= size; index += 1) rows[col][index] /= divisor;
      for (let row = 0; row < size; row += 1) {
        if (row === col) continue;
        const factor = rows[row][col];
        for (let index = col; index <= size; index += 1) rows[row][index] -= factor * rows[col][index];
      }
    }
    return rows.map(row => row[size]);
  }

  function perspectiveCoefficients(points) {
    const ordered = orderQuad(points);
    const matrix = [];
    const vector = [];
    const target = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let index = 0; index < 4; index += 1) {
      const [u, v] = target[index];
      const { x, y } = ordered[index];
      matrix.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
      vector.push(x);
      matrix.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
      vector.push(y);
    }
    return solveLinear(matrix, vector);
  }

  function warpPerspective(source, points, targetWidth, targetHeight) {
    const coefficients = perspectiveCoefficients(points);
    if (!coefficients) return null;
    const output = document.createElement('canvas');
    output.width = targetWidth;
    output.height = targetHeight;
    const inputContext = source.getContext('2d', { willReadFrequently: true });
    const input = inputContext.getImageData(0, 0, source.width, source.height);
    const context = output.getContext('2d');
    const result = context.createImageData(targetWidth, targetHeight);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const u = targetWidth <= 1 ? 0 : x / (targetWidth - 1);
        const v = targetHeight <= 1 ? 0 : y / (targetHeight - 1);
        const denominator = coefficients[6] * u + coefficients[7] * v + 1;
        const sx = (coefficients[0] * u + coefficients[1] * v + coefficients[2]) / denominator;
        const sy = (coefficients[3] * u + coefficients[4] * v + coefficients[5]) / denominator;
        const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(sx)));
        const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(sy)));
        const x1 = Math.max(0, Math.min(source.width - 1, x0 + 1));
        const y1 = Math.max(0, Math.min(source.height - 1, y0 + 1));
        const fx = Math.max(0, Math.min(1, sx - x0));
        const fy = Math.max(0, Math.min(1, sy - y0));
        const out = (y * targetWidth + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          const p00 = input.data[(y0 * source.width + x0) * 4 + channel];
          const p10 = input.data[(y0 * source.width + x1) * 4 + channel];
          const p01 = input.data[(y1 * source.width + x0) * 4 + channel];
          const p11 = input.data[(y1 * source.width + x1) * 4 + channel];
          result.data[out + channel] = Math.round((p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy);
        }
      }
    }
    context.putImageData(result, 0, 0);
    return output;
  }

  function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('名片圖片讀取失敗'));
      image.src = dataUrl;
    });
  }

  function canvasToDataUrl(canvas, maxChars) {
    let quality = 0.9;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > maxChars && quality > 0.45) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }

  async function normalizeInput(file, options) {
    if (!(file instanceof Blob) || !file.size) throw new Error('找不到名片圖片');
    const settings = options || {};
    const maxSide = Number(settings.maxSide) || 2200;
    const maxChars = Number(settings.maxChars) || 1800000;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('名片圖片讀取失敗'));
      reader.readAsDataURL(file);
    });
    const image = await imageFromDataUrl(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToDataUrl(canvas, maxChars);
  }

  async function cropDataUrl(dataUrl, rawLocalization, options) {
    const localization = normalizeLocalization(rawLocalization);
    if (!localization.detected || localization.incomplete || localization.cropConfidence < AUTO_CROP_CONFIDENCE) return null;
    const settings = options || {};
    const image = await imageFromDataUrl(dataUrl);
    const maxSide = Number(settings.maxSide) || 2200;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const source = document.createElement('canvas');
    source.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    source.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    source.getContext('2d', { alpha: false }).drawImage(image, 0, 0, source.width, source.height);

    const box = localization.boundingBox;
    if (box.width < 0.08 || box.height < 0.05) return null;
    const padX = box.width * 0.015;
    const padY = box.height * 0.015;
    const left = Math.max(0, box.x - padX);
    const top = Math.max(0, box.y - padY);
    const right = Math.min(1, box.x + box.width + padX);
    const bottom = Math.min(1, box.y + box.height + padY);
    const bx = Math.round(left * source.width);
    const by = Math.round(top * source.height);
    const bw = Math.round((right - left) * source.width);
    const bh = Math.round((bottom - top) * source.height);
    if (bw < 80 || bh < 50) return null;

    let output = null;
    let method = 'bounding-box';
    if (localization.corners.length === 4) {
      const rawPoints = orderQuad(localization.corners.map(point => ({ x: point.x * source.width, y: point.y * source.height })));
      const xs = rawPoints.map(point => point.x / source.width);
      const ys = rawPoints.map(point => point.y / source.height);
      const cornerBox = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      const intersectionLeft = Math.max(box.x, cornerBox.x);
      const intersectionTop = Math.max(box.y, cornerBox.y);
      const intersectionRight = Math.min(box.x + box.width, cornerBox.x + cornerBox.width);
      const intersectionBottom = Math.min(box.y + box.height, cornerBox.y + cornerBox.height);
      const intersection = Math.max(0, intersectionRight - intersectionLeft) * Math.max(0, intersectionBottom - intersectionTop);
      const union = box.width * box.height + cornerBox.width * cornerBox.height - intersection;
      const boxIou = union > 0 ? intersection / union : 0;
      const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cornerCenter = { x: cornerBox.x + cornerBox.width / 2, y: cornerBox.y + cornerBox.height / 2 };
      const centerDelta = Math.hypot(boxCenter.x - cornerCenter.x, boxCenter.y - cornerCenter.y);
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const widthEstimate = (distance(rawPoints[0], rawPoints[1]) + distance(rawPoints[3], rawPoints[2])) / 2;
      const heightEstimate = (distance(rawPoints[0], rawPoints[3]) + distance(rawPoints[1], rawPoints[2])) / 2;
      const rawRatio = widthEstimate / Math.max(1, heightEstimate);
      const boxRatio = (box.width * source.width) / Math.max(1, box.height * source.height);
      const ratioAgreement = Math.max(rawRatio, boxRatio) / Math.max(0.001, Math.min(rawRatio, boxRatio));
      const cardLikeRatio = (rawRatio >= 1.2 && rawRatio <= 2.15) || (rawRatio >= 0.46 && rawRatio <= 0.83);
      const cornersAgreeWithBox = boxIou >= 0.72 && centerDelta <= 0.06 && ratioAgreement <= 1.22 && cardLikeRatio && Math.min(widthEstimate, heightEstimate) >= 80;
      if (cornersAgreeWithBox) {
        const center = rawPoints.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
        const points = rawPoints.map(point => ({
          x: Math.max(0, Math.min(source.width - 1, center.x + (point.x - center.x) * 1.025)),
          y: Math.max(0, Math.min(source.height - 1, center.y + (point.y - center.y) * 1.025))
        }));
        const ratio = Math.max(0.45, Math.min(2.2, rawRatio));
        const longSide = Math.min(1600, Math.max(1, Math.round(Math.max(widthEstimate, heightEstimate))));
        const width = ratio >= 1 ? longSide : Math.max(1, Math.round(longSide * ratio));
        const height = ratio >= 1 ? Math.max(1, Math.round(longSide / ratio)) : longSide;
        output = warpPerspective(source, points, width, height);
        if (output) method = 'perspective';
      }
    }
    if (!output) {
      output = document.createElement('canvas');
      output.width = bw;
      output.height = bh;
      output.getContext('2d', { alpha: false }).drawImage(source, bx, by, bw, bh, 0, 0, bw, bh);
    }
    return {
      dataUrl: canvasToDataUrl(output, Number(settings.maxChars) || 900000),
      method,
      localization
    };
  }

  return {
    AUTO_CROP_CONFIDENCE,
    normalizeLocalization,
    normalizeInput,
    orderQuad,
    perspectiveCoefficients,
    warpPerspective,
    cropDataUrl
  };
});
