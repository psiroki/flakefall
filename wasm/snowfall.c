#include <stdint.h>

static uint64_t nextSeed(uint64_t seed) {
  return (seed * 0x5DEECE66DLL + 0xBLL) & ((1LL << 48) - 1);
}

static uint64_t fillPermutations(uint64_t seed, uint32_t *p, uint32_t c, uint32_t stride) {
  uint32_t *fp = p;
  for (int x = 0; x < c; ++x) {
    *fp = x;
    fp += stride;
  }
  for (int x = 1; x < c; ++x) {
    int first = x - 1;
    int second = first + (seed = nextSeed(seed)) % (c - first);
    if (second != first) {
      first *= stride;
      second *= stride;
      uint32_t save = p[first];
      p[first] = p[second];
      p[second] = save;
    }
  }
  return seed;
}

void initPermutations(uint32_t baseSeed, uint32_t *permutationBuffer, uint32_t w, uint32_t h) {
  uint64_t seed = nextSeed((uint64_t) baseSeed ^ 0xa0de23ac904cULL);
  uint32_t *p = permutationBuffer;
  for (int y = 0; y < h; ++y) {
    seed = fillPermutations(seed, p+1, w-2, 1);
    p += w;
  }
  fillPermutations(seed, permutationBuffer, h, w);
  fillPermutations(seed, permutationBuffer + w - 1, h, w);
}

void stepFrame(uint32_t frame, uint32_t *buf, uint32_t w, uint32_t h, uint32_t *permutationBuffer) {
  const uint32_t numPixels = w * h;
  uint32_t pitch = w;
  uint64_t seed = nextSeed((uint64_t) frame ^ 0xa0de23ac904cULL);
  if (frame == 0) {
    // add frame
    uint32_t *low = buf, *high = buf + w - 1;
    for (int y = 0; y < h; ++y) {
      *low = *high = 0xff444444;
      low += pitch;
      high += pitch;
    }
  }
  // the bottom line moves nowhere anyway
  uint32_t *line = buf + pitch * (h - 2) + 1;
  uint32_t updateWidth = w - 2;
  for (int y = h - 1; y > 0; --y) {
    uint32_t *nextLine = line + pitch;
    uint32_t *perm = permutationBuffer + ((seed = nextSeed(seed)) % h) * w + 1;
    for (int pi = 0; pi < updateWidth; ++pi) {
      int x = perm[pi];
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
