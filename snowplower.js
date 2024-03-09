const playfieldWidth = 72*2;
const playfieldHeight = 128*2;

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
  const nextFrame = () => {
    try {
      stepFrame(frame++, playfieldPtr, playfieldWidth, playfieldHeight, pixelsPtr);
    } catch (e) {
      throw e;
    }
    const image = new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), playfieldWidth, playfieldHeight);
    lowRezCtx.putImageData(image, 0, 0);
    ctx.drawImage(lowRezCanvas, 0, 0, canvas.width, canvas.height);
  };

  let down = false;
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
  canvas.addEventListener("pointerdown", e => {
    if (e.isPrimary) down = true;
  });
  document.addEventListener("pointerup", _ => {
    down = false;
  });
  document.addEventListener("pointercancel", _ => {
    down = false;
  });
  canvas.addEventListener("pointermove", e => {
    if (down && e.isPrimary) {
      let pageToPlayfield = playfieldWidth / canvas.offsetWidth;
      let x = e.pageX * pageToPlayfield | 0;
      let y = e.pageY * pageToPlayfield | 0;
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
