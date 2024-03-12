#include <stdint.h>

uint64_t nextSeed(uint64_t seed) {
  return (seed * 0x5DEECE66DLL + 0xBLL) & ((1LL << 48) - 1);
}

void stepFrame(uint32_t frame, uint32_t *buf, uint32_t w, uint32_t h) {
  const uint32_t numPixels = w * h;
  uint32_t pitch = w;
  uint64_t seed = nextSeed((uint64_t) frame ^ 0xa0de23ac904cULL);
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
  // the bottom line moves nowhere anyway
  uint32_t *line = buf + pitch * (h - 2) + 1;
  uint32_t updateWidth = w - 2;
  for (int y = h - 1; y > 0; --y) {
    uint32_t *nextLine = line + pitch;
    for (int x = 0; x < updateWidth; ++x) {
      uint32_t cp = line[x];
      if (cp) {
        int possibleIndex = 0;
        int possible[3];
        for (int i = -1; i < 2; ++i) {
          // unoccupied both this and the next frame
          uint32_t val = nextLine[x+i];
          if (!val) {
            possible[possibleIndex++] = i;
          }
        }
        if (possibleIndex) {
          if (possibleIndex > 1) {
            possibleIndex = ((seed = nextSeed(seed)) >> 7) % possibleIndex;
          } else {
            possibleIndex = 0;  // the only choice
          }
          nextLine[x+possible[possibleIndex]] = cp;
          line[x] = 0;
        }
      }
    }
    line -= pitch;
  }
}
