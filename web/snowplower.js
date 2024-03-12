const playfieldWidth = 72;
const playfieldHeight = 128;

class LinearAllocator {
  constructor(buffer, baseAddress) {
    this.buffer = buffer;
    this.baseAddress = baseAddress ?? 0;
    this.top = this.baseAddress;
  }

  allocate(bytes) {
    let ptr = this.top;
    this.top += bytes;
    if (this.top > this.buffer.byteLength)
      throw "Out of memory: "+ptr+"+"+bytes+" > "+this.buffer.byteLength;
    return ptr;
  }

  allocateUint32(count) {
    const ptr = this.allocate(count * 4);
    return [
      new Uint32Array(this.buffer, ptr, count),
      ptr,
    ];
  }
}

function loopRender(fun, skipFrames) {
  let looper;
  let frameCounter = 0;
  looper = () => {
    let result = (frameCounter++ % skipFrames) == 0 ? fun() : true;
    if (typeof result === "undefined" || result) requestAnimationFrame(looper);
  };
  requestAnimationFrame(looper);
}

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function createOffscreenCanvas(w, h) {
  let canvas;
  if (window.OffscreenCanvas) {
    canvas = new OffscreenCanvas(w, h);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  }
  return [canvas, canvas.getContext("2d")];
}

async function plowSnow() {
  // Load the wasm module
  const response = await fetch('snowfall.wasm');
  const buffer = await response.arrayBuffer();
  const module = await WebAssembly.compile(buffer);
  const instance = await WebAssembly.instantiate(module);
  const memory = instance.exports.memory;
  memory.grow(256); // 16 MB should be enough

  // Accessing the globals
  const dataEnd = instance.exports.__data_end;
  const globalBase = instance.exports.__global_base;
  const heapBase = instance.exports.__heap_base;
  const memoryBase = instance.exports.__memory_base;
  const tableBase = instance.exports.__table_base;

  const heap = new DataView(memory.buffer);
  const allocator = new LinearAllocator(memory.buffer, instance.exports.__heap_base);
  const [playfield, playfieldPtr] = allocator.allocateUint32(playfieldWidth * playfieldHeight);
  const [pixels, pixelsPtr] = allocator.allocateUint32(playfieldWidth * playfieldHeight);

  console.log('__data_end:', dataEnd);
  console.log('__global_base:', globalBase);
  console.log('__heap_base:', heapBase);
  console.log('__memory_base:', memoryBase);
  console.log('__table_base:', tableBase);

  // Get the function named 'stepFrame' from the wasm module
  const stepFrame = instance.exports.stepFrame;
  let frame = 0;
  const canvas = document.querySelector("canvas");
  let scale = 10;
  canvas.width = playfieldWidth * scale;
  canvas.height = playfieldHeight * scale;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  ctx.imageSmoothingEnabled = false;
  const [lowRezCanvas, lowRezCtx] = createOffscreenCanvas(playfieldWidth, playfieldHeight);
  let dirtyPlayfield = false;
  const nextFrame = () => {
    try {
      stepFrame(frame++, playfieldPtr, playfieldWidth, playfieldHeight, pixelsPtr);
      dirtyPlayfield = true;
    } catch (e) {
      throw e;
    }
    const image = new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), playfieldWidth, playfieldHeight);
    lowRezCtx.putImageData(image, 0, 0);
    ctx.drawImage(lowRezCanvas, 0, 0, canvas.width, canvas.height);
  };

  let angle = 0;
  let fullscreen = false;
  document.addEventListener("fullscreenchange", _ => {
    fullscreen = !!document.fullscreenElement;
  });
  document.querySelector(".fullscreen").addEventListener("click", _ => {
    if (!fullscreen) {
      document.body.requestFullscreen({ navigationUI: "hide" });
      fullscreen = true;
    } else {
      document.exitFullscreen();
      fullscreen = false;
    }
  });
  let rotated = false;
  function syncResize() {
    rotated = window.innerWidth > window.innerHeight;
    canvas.classList.toggle("horizontal", rotated);
  }
  function savePlayfield() {
    if (!dirtyPlayfield) return;
    let bytes;
    let valuesUsed = new Set(playfield);
    if (valuesUsed.size <= 255) {
      if (valuesUsed.size === 1) {
        valuesUsed.add(0xffffffff);
      }
      valuesUsed = Array.from(valuesUsed);
      let blackSwappedWith = valuesUsed.indexOf(0);
      if (blackSwappedWith > 0) {
        valuesUsed[blackSwappedWith] = valuesUsed[0];
        valuesUsed[0] = 0;
      }
      let lookup = new Map(valuesUsed.map((e, i) => [e, i]));
      valuesUsed = new Uint32Array(valuesUsed);
      bytes = new Uint8Array(playfield.length + 1 + 4*valuesUsed.length);
      bytes[0] = valuesUsed.length;
      let paletteBytes = new Uint8Array(valuesUsed.buffer);
      bytes.set(paletteBytes, 1);
      let offset = 1 + paletteBytes.length;
      for (let i = 0; i < playfield.length; ++i) {
        bytes[i + offset] = lookup.get(playfield[i]);
      }
    } else {
      bytes = new Uint8Array(playfield.byteLength + 1);
      bytes[0] = 0;
      bytes.set(new Uint8Array(playfield.buffer, playfield.byteOffset, playfield.byteLength), 1);
    }
    sessionStorage.setItem("flakefield", window.btoa(String.fromCharCode(...bytes)));
    dirtyPlayfield = false;
  }
  function loadPlayfield() {
    let b64 = sessionStorage.getItem("flakefield");
    if (b64) {
      let bytes = new Uint8Array(Array.from(window.atob(b64)).map(e => e.charCodeAt(0)));
      if (bytes[0] > 0) {
        let palette = new Uint32Array(bytes[0]);
        new Uint8Array(palette.buffer).set(bytes.subarray(1, palette.byteLength + 1));
        let refs = bytes.subarray(1 + palette.length * 4);
        for (let i = 0; i < refs.length; ++i) {
          playfield[i] = palette[refs[i]];
        }
      } else {
        new Uint8Array(playfield.buffer, playfield.byteOffset, playfield.byteLength).set(bytes.subarray(1));
      }
    }
  }
  window.addEventListener("resize", syncResize);
  window.addEventListener("pagehide", savePlayfield);
  window.addEventListener("visibilitychange", _ => {
    if (document.visibilityState === "hidden") {
      savePlayfield();
    } else {
      if (location.hostname === "localhost") {
        // it is not ready yet, so it
        // only works in local testing
        loadPlayfield();
      }
    }
  });
  syncResize();
  canvas.addEventListener("pointermove", e => {
    if (e.pressure > 0.25) {
      let pageToPlayfield = playfieldWidth / canvas.offsetWidth;
      let x = e.pageX;
      let y = e.pageY;
      if (rotated) {
        let newY = canvas.offsetHeight - 1 - x;
        x = y;
        y = newY;
      }
      x = x * pageToPlayfield | 0;
      y = y * pageToPlayfield | 0;
      if (x >= 1 && x < playfieldWidth - 1 && y >= 0 && y < playfieldHeight) {
        let sat = (1 - 0.125) + Math.cos(angle / 180 / 4 * Math.PI) * 0.125;
        let color = hslToRgb(angle++, sat, 0.5).map((e, i) => e * 31 << (i * 5)).reduce((a, b) => a|b);
        let o = y * playfieldWidth + x;
        playfield[o] = color | color << 16;
      }
    }
  });
  loopRender(nextFrame, 1);
}

plowSnow();
