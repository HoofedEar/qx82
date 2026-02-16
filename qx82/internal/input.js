import * as main from "./main.js";
import { CONFIG } from "../config.js";

export class InputSys {
  constructor() {
    // Keys currently held down (array of strings).
    this.keysHeld_ = new Set();
    // Keys that were just pressed on this frame.
    this.keysJustPressed_ = new Set();

    // Mouse state: position in virtual canvas pixels, -1 when off canvas.
    this.mouseX_ = -1;
    this.mouseY_ = -1;
    // Mouse buttons currently held (keyed by button number: 0=left, 1=middle, 2=right).
    this.mouseButtonsHeld_ = new Set();
    // Mouse buttons just pressed this frame.
    this.mouseButtonsJustPressed_ = new Set();
    // Mouse buttons just released this frame.
    this.mouseButtonsJustReleased_ = new Set();

    window.addEventListener("keydown", e => this.onKeyDown(e));
    window.addEventListener("keyup", e => this.onKeyUp(e));
  }

  // Called from main.js after the real canvas is created.
  // coordConverter is an optional function(clientX, clientY) => {x, y} for
  // custom coordinate mapping (e.g. 3D CRT mode with raycasting).
  initMouse(realCanvas, coordConverter = null) {
    this.realCanvas_ = realCanvas;
    this.coordConverter_ = coordConverter;

    realCanvas.addEventListener("mousemove", e => this.onMouseMove_(e));
    realCanvas.addEventListener("mousedown", e => this.onMouseDown_(e));
    realCanvas.addEventListener("mouseup", e => this.onMouseUp_(e));
    realCanvas.addEventListener("mouseleave", e => this.onMouseLeave_(e));
    // Prevent context menu on right-click so we can use it as a game input.
    realCanvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  // Sets the coordinate converter (called after 3D setup).
  setCoordConverter(converter) {
    this.coordConverter_ = converter;
  }

  // Convert browser mouse event coordinates to virtual canvas coordinates.
  // Returns {x, y} in virtual pixels, or {x: -1, y: -1} if outside the canvas.
  toVirtualCoords_(e) {
    // If a custom converter is set (e.g. 3D raycasting), use it.
    if (this.coordConverter_) {
      return this.coordConverter_(e.clientX, e.clientY);
    }
    // Default 2D linear mapping.
    const rect = this.realCanvas_.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    if (relX < 0 || relY < 0 || relX >= rect.width || relY >= rect.height) {
      return { x: -1, y: -1 };
    }
    return {
      x: Math.floor(relX * CONFIG.SCREEN_WIDTH / rect.width),
      y: Math.floor(relY * CONFIG.SCREEN_HEIGHT / rect.height),
    };
  }

  onMouseMove_(e) {
    const pos = this.toVirtualCoords_(e);
    this.mouseX_ = pos.x;
    this.mouseY_ = pos.y;
  }

  onMouseDown_(e) {
    const pos = this.toVirtualCoords_(e);
    this.mouseX_ = pos.x;
    this.mouseY_ = pos.y;
    this.mouseButtonsHeld_.add(e.button);
    this.mouseButtonsJustPressed_.add(e.button);
  }

  onMouseUp_(e) {
    const pos = this.toVirtualCoords_(e);
    this.mouseX_ = pos.x;
    this.mouseY_ = pos.y;
    this.mouseButtonsHeld_.delete(e.button);
    this.mouseButtonsJustReleased_.add(e.button);
  }

  onMouseLeave_(e) {
    this.mouseX_ = -1;
    this.mouseY_ = -1;
  }

  getMouseX() { return this.mouseX_; }
  getMouseY() { return this.mouseY_; }
  mouseButtonHeld(button) { return this.mouseButtonsHeld_.has(button); }
  mouseButtonJustPressed(button) { return this.mouseButtonsJustPressed_.has(button); }
  mouseButtonJustReleased(button) { return this.mouseButtonsJustReleased_.has(button); }

  keyHeld(keyName) {
    return this.keysHeld_.has(keyName.toUpperCase());
  }
  // API function
  keyJustPressed(keyName) { return this.keysJustPressed_.has(keyName.toUpperCase()); }

  onEndFrame() {
    this.keysJustPressed_.clear();
    this.mouseButtonsJustPressed_.clear();
    this.mouseButtonsJustReleased_.clear();
  }

  onKeyDown(e) {
    this.keysJustPressed_.add(e.key.toUpperCase());
    this.keysHeld_.add(e.key.toUpperCase());

    if (main.hasPendingAsync("qxa.key")) {
      main.resolveAsync("qxa.key", e.key);
    }
  }

  onKeyUp(e) {
    this.keysHeld_.delete(e.key.toUpperCase());
  }

  readKeyAsync() {
    return new Promise((resolve, reject) => {
      main.startAsync("qxa.key", resolve, reject);
    });
  }

  async readLine(initString, maxLen, maxWidth = -1, drawArea = false) {
    const startCol = main.drawState.cursorCol;
    const startRow = main.drawState.cursorRow;
    let curCol = startCol;
    let curRow = startRow;
    let curStrings = [initString];
    let curPos = 0;
    const cursorWasVisible = main.drawState.cursorVisible;

    // Draw the input field background if maxWidth is specified
    if (maxWidth !== -1 && drawArea) {
      const numRows = Math.ceil(maxLen / maxWidth) || 1;
      for (let row = 0; row < numRows; row++) {
        main.setCursorLocation(startCol, startRow + row);
        const widthForThisRow = (row === numRows - 1 && maxLen % maxWidth !== 0)
          ? maxLen % maxWidth
          : maxWidth;
        main.textRenderer.print(" ".repeat(widthForThisRow));
      }
    }

    main.cursorRenderer.setCursorVisible(true);
    while (true) {
      main.setCursorLocation(curCol, curRow);
      main.textRenderer.print(curStrings[curPos] || "");
      const key = await this.readKeyAsync();
      if (key === "Backspace") {
        if (curStrings[curPos].length === 0) {
          if (curPos === 0) {
            continue;
          }
          curPos--;
          curRow--;
        }
        curStrings[curPos] = curStrings[curPos].length > 0 ? curStrings[curPos].substring(0, curStrings[curPos].length - 1) : curStrings[curPos];
        // Erase the character.
        main.setCursorLocation(curCol + curStrings[curPos].length, curRow);
        main.textRenderer.print(" ");
      } else if (key === "Enter" || key === "ButtonA") {
        // Move cursor to start of next line.
        main.setCursorLocation(1, curRow + 1);
        // Restore previous cursor state.
        main.cursorRenderer.setCursorVisible(cursorWasVisible);
        return curStrings.join("");
      } else if (key.length === 1) {
        if (curStrings.join("").length < maxLen || maxLen === -1) {
          curStrings[curPos] += key;

          if (maxWidth !== -1 && curStrings[curPos].length >= maxWidth) {
            main.textRenderer.print(curStrings[curPos].charAt(curStrings[curPos].length-1));
            curCol = startCol;
            curPos++;
            curStrings[curPos] = "";
            curRow++;
          }
        }
      }
    }
  }
}
