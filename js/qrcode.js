/**
 * Pure JavaScript Offline QR Code SVG Generator (Versions 1 to 6, ECC Level L)
 * Generates standard ISO/IEC 18004 scannable QR codes with zero external dependencies.
 */
(function (global) {
  // GF(256) exponent & log tables for Reed-Solomon
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      EXP[i] = EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const root = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return msg.slice(data.length);
  }

  // Version specs for ECC Level L (1..6)
  // totalCodewords, ecCodewordsPerBlock, numBlocks, alignmentCenters
  const VERSION_SPECS = [
    null,
    { size: 21, totalData: 19, ecLen: 7, blocks: 1, align: [] },
    { size: 25, totalData: 34, ecLen: 10, blocks: 1, align: [6, 18] },
    { size: 29, totalData: 55, ecLen: 15, blocks: 1, align: [6, 22] },
    { size: 33, totalData: 80, ecLen: 20, blocks: 1, align: [6, 26] },
    { size: 37, totalData: 108, ecLen: 26, blocks: 1, align: [6, 30] },
    { size: 41, totalData: 136, ecLen: 18, blocks: 2, align: [6, 34] }
  ];

  function encodeUTF8Bytes(str) {
    const utf8 = unescape(encodeURIComponent(str));
    const arr = [];
    for (let i = 0; i < utf8.length; i++) {
      arr.push(utf8.charCodeAt(i));
    }
    return arr;
  }

  function selectVersion(byteLen) {
    for (let v = 1; v <= 6; v++) {
      const cap = VERSION_SPECS[v].totalData - 2; // 4-bit mode + 8-bit length + 4-bit terminator
      if (byteLen <= cap) return v;
    }
    return 6;
  }

  function buildDataCodewords(bytes, spec) {
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }
    // Byte mode indicator (0100)
    pushBits(0b0100, 4);
    // Character count (8 bits for versions 1..9)
    pushBits(bytes.length, 8);
    for (let i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }
    const maxBits = spec.totalData * 8;
    // Terminator up to 4 zeros
    const term = Math.min(4, maxBits - bits.length);
    pushBits(0, term);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      codewords.push(b);
    }
    let padToggle = true;
    while (codewords.length < spec.totalData) {
      codewords.push(padToggle ? 0xec : 0x11);
      padToggle = !padToggle;
    }
    return new Uint8Array(codewords);
  }

  function buildFullBitStream(dataCodewords, spec) {
    if (spec.blocks === 1) {
      const ec = rsEncode(dataCodewords, spec.ecLen);
      const all = new Uint8Array(dataCodewords.length + ec.length);
      all.set(dataCodewords, 0);
      all.set(ec, dataCodewords.length);
      return all;
    } else {
      // Interleave 2 blocks (Version 6-L)
      const blockSize = spec.totalData / spec.blocks;
      const b1 = dataCodewords.slice(0, blockSize);
      const b2 = dataCodewords.slice(blockSize);
      const ec1 = rsEncode(b1, spec.ecLen);
      const ec2 = rsEncode(b2, spec.ecLen);
      const out = [];
      for (let i = 0; i < blockSize; i++) {
        out.push(b1[i], b2[i]);
      }
      for (let i = 0; i < spec.ecLen; i++) {
        out.push(ec1[i], ec2[i]);
      }
      return new Uint8Array(out);
    }
  }

  function createMatrix(spec) {
    const N = spec.size;
    const matrix = Array.from({ length: N }, () => new Int8Array(N)); // 0=light, 1=dark
    const reserved = Array.from({ length: N }, () => new Uint8Array(N));

    function setModule(r, c, dark, isReserved = true) {
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      matrix[r][c] = dark ? 1 : 0;
      if (isReserved) reserved[r][c] = 1;
    }

    function placeFinder(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setModule(row + r, col + c, !isBorder && (isOuter || isInner), true);
        }
      }
    }

    placeFinder(0, 0);
    placeFinder(0, N - 7);
    placeFinder(N - 7, 0);

    // Alignment patterns
    if (spec.align.length > 0) {
      const coords = spec.align;
      for (let i = 0; i < coords.length; i++) {
        for (let j = 0; j < coords.length; j++) {
          const ar = coords[i];
          const ac = coords[j];
          if (reserved[ar][ac]) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
              setModule(ar + r, ac + c, dark, true);
            }
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < N - 8; i++) {
      if (!reserved[6][i]) setModule(6, i, i % 2 === 0, true);
      if (!reserved[i][6]) setModule(i, 6, i % 2 === 0, true);
    }

    // Dark module & reserve format info areas
    setModule(N - 8, 8, true, true);
    for (let i = 0; i < 9; i++) {
      if (!reserved[8][i]) reserved[8][i] = 1;
      if (!reserved[i][8]) reserved[i][8] = 1;
    }
    for (let i = 0; i < 8; i++) {
      if (!reserved[8][N - 1 - i]) reserved[8][N - 1 - i] = 1;
      if (!reserved[N - 1 - i][8]) reserved[N - 1 - i][8] = 1;
    }

    return { matrix, reserved };
  }

  function placeDataBits(matrix, reserved, codewords, N) {
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;

    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) {
        const r = upward ? N - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!reserved[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) {
              dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
              bitIdx++;
            }
            // Apply mask pattern 0: (r + c) % 2 === 0
            if ((r + c) % 2 === 0) dark = !dark;
            matrix[r][c] = dark ? 1 : 0;
          }
        }
      }
      upward = !upward;
    }

    // Format info for ECC Level L (01) and Mask 0 (000) -> precomputed BCH bits: 0x77c4 (111011111000100)
    const formatBits = 0x77c4;
    for (let i = 0; i < 6; i++) matrix[8][i] = (formatBits >>> i) & 1;
    matrix[8][7] = (formatBits >>> 6) & 1;
    matrix[8][8] = (formatBits >>> 7) & 1;
    matrix[7][8] = (formatBits >>> 8) & 1;
    for (let i = 9; i < 15; i++) matrix[14 - i][8] = (formatBits >>> i) & 1;

    for (let i = 0; i < 8; i++) matrix[8][N - 1 - i] = (formatBits >>> i) & 1;
    for (let i = 8; i < 15; i++) matrix[N - 15 + i][8] = (formatBits >>> i) & 1;
  }

  function generateQRSVG(text, sizePx = 190) {
    try {
      let bytes = encodeUTF8Bytes(text);
      if (bytes.length > 134) {
        bytes = bytes.slice(0, 134);
      }
      const ver = selectVersion(bytes.length);
      const spec = VERSION_SPECS[ver];
      const dataCw = buildDataCodewords(bytes, spec);
      const fullCw = buildFullBitStream(dataCw, spec);
      const { matrix, reserved } = createMatrix(spec);
      placeDataBits(matrix, reserved, fullCw, spec.size);

      const N = spec.size;
      const margin = 3;
      const total = N + margin * 2;
      let pathD = '';
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (matrix[r][c]) {
            pathD += `M${c + margin},${r + margin}h1v1h-1z`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" style="border-radius:12px;background:#ffffff;display:block;">
        <rect width="${total}" height="${total}" fill="#ffffff"/>
        <path d="${pathD}" fill="#0f172a"/>
      </svg>`;
    } catch (e) {
      console.error('QR generation error:', e);
      return `<div style="width:${sizePx}px;height:${sizePx}px;display:flex;align-items:center;justify-content:center;background:#fff;color:#0f172a;border-radius:12px;font-size:12px;">QR 생성 오류</div>`;
    }
  }

  global.KkachiQR = {
    toSVG: generateQRSVG
  };
})(window);
