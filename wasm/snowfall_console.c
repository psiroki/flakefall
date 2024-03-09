#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include "snowfall.c"

int main() {
  const int w = 32;
  const int h = 32;
  uint32_t playfield[w * h], pixels[w * h];
  for (int i = w*h; i > 0; --i) {
    playfield[i] = i < w ? 0x7fff7fff : 0;
  }
  printf("\x1b[2J");
  for (int frame = 0; frame <= 1000; ++frame) {
    if (frame > 0) usleep(100000);
    stepFrame(frame, playfield, w, h, pixels);
    printf("\x1b[H");
    const uint32_t *p = pixels;
    for (int y = 0; y < h; ++y) {
      for (int x = 0; x < w; ++x) {
        int sample = *p++ & 0xffff;
        putchar(sample ? 'O' : ' ');
        putchar(sample ? 'O' : ' ');
      }
      putchar('\n');
    }
  }
  return 0;
}
