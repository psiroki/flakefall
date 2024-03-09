#include <stdint.h>

typedef struct SnowBuffer {
  uint32_t *ptr;
  uint32_t w;
  uint32_t h;
  uint32_t pitch;
  uint32_t frame;
  uint64_t seed;
} SnowBuffer;

uint64_t nextSeed(uint64_t seed) {
  return (seed * 0x5DEECE66DLL + 0xBLL) & ((1LL << 48) - 1);
}

void stepFrame(uint32_t frame, uint32_t *buf, uint32_t w, uint32_t h, uint32_t *pixels) {
  const uint32_t numPixels = w * h;
  uint32_t pitch = w;
  SnowBuffer buffer = {
    .ptr = buf,
    .w = w,
    .h = h,
    .pitch = pitch,
    .frame = frame,
    .seed = nextSeed((uint64_t) frame ^ 0xa0de23ac904cLL),
  };
  if (frame == 0) {
    // add frame
    uint32_t *low = buf, *high = buf + w - 1;
    for (int y = 0; y < h; ++y) {
      *low = UINT32_MAX;
      *high = UINT32_MAX;
      low += pitch;
      high += pitch;
    }
  }
  buffer.ptr += 1;
  w = (buffer.w -= 2);
  // pitch stays the same
  uint32_t *line = buffer.ptr;
  int nextFrameShift = (~frame & 1) << 4;
  int prevFrameShift = (frame & 1) << 4;
  const uint32_t clearMask = 0xffffu << prevFrameShift | 0x80008000u;
  for (int x = 0; x < w; ++x) {
    line[x] &= clearMask;
  }
  for (int y = h - 1; y > 0; --y) {
    uint32_t *nlp = line + pitch;
    uint32_t *clp = nlp;
    // we keep this frame, and throw away next frame bits, except we keep the upper bit
    *clp++ &= clearMask;
    *clp++ &= clearMask;
    uint32_t *cur = line;
    for (int x = 0; x < w; ++x) {
      *clp++ &= clearMask;
      uint32_t cp = (*cur >> prevFrameShift) & 0xffffu;
      uint32_t *dest;
      if (cp & 0x7fffu) {
        int possibleIndex = 0;
        int possible[3];
        for (int i = -1; i < 2; ++i) {
          // unoccupied both this and the next frame
          uint32_t val = nlp[i];
          if (!val) {
            possible[possibleIndex++] = i;
          }
        }
        if (possibleIndex) {
          if (possibleIndex > 1) {
            possibleIndex = ((buffer.seed = nextSeed(buffer.seed)) >> 7) % possibleIndex;
          } else {
            possibleIndex = 0;  // the only choice
          }
          dest = nlp + possible[possibleIndex];
        } else {
          // we stay where we are
          dest = cur;
        }
        *dest = cp << nextFrameShift | (*dest & (0xffffu << prevFrameShift));
      }
      ++nlp;
      ++cur;
    }
    line += pitch;
  }
  for (int x = 0; x < w; ++x) {
    uint32_t sample = *line;
    uint16_t cp = sample >> prevFrameShift;
    if (cp) *line = cp << nextFrameShift | (sample & (0xffffu << prevFrameShift));
    ++line;
  }
  if (pixels) {
    for (int i = numPixels; i > 0; --i) {
      uint32_t sample = (*buf++) >> nextFrameShift & 0xffff;
      *pixels++ = sample & 0x8000 ? 0xff444444u :
          (sample & 0x1fu) << 3 |
          (sample & (0x1fu << 5)) << 6 |
          (sample & (0x1fu << 10)) << 9 |
          0xff000000u;
    }
  }
}
