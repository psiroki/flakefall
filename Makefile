CC = clang
CFLAGS = -std=c17 -nostdlib --target=wasm32 -g3 -O3
LDFLAGS = -Wl,--no-entry -Wl,--export-all
SRC_DIR = wasm
BUILD_DIR = build
WEB_DIR = web
TARGET = snowfall

all: $(WEB_DIR)/$(TARGET).wasm

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/$(TARGET).wasm: $(BUILD_DIR) $(SRC_DIR)/$(TARGET).c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRC_DIR)/$(TARGET).c

$(WEB_DIR)/$(TARGET).wasm: $(BUILD_DIR)/$(TARGET).wasm
	cp $(BUILD_DIR)/$(TARGET).wasm $(WEB_DIR)/$(TARGET).wasm

clean:
	rm -rf $(BUILD_DIR)

.PHONY: all clean
