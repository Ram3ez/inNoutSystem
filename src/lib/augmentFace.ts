export async function generateAugmentations(
  sourceCanvas: HTMLCanvasElement
): Promise<HTMLCanvasElement[]> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // 1. Flip
  const flipCanvas = document.createElement("canvas");
  flipCanvas.width = width;
  flipCanvas.height = height;
  const flipCtx = flipCanvas.getContext("2d");
  if (flipCtx) {
    flipCtx.translate(width, 0);
    flipCtx.scale(-1, 1);
    flipCtx.drawImage(sourceCanvas, 0, 0);
  }

  // Helper for brightness
  const adjustBrightness = (offset: number) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    
    ctx.drawImage(sourceCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + offset)); // R
      imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + offset)); // G
      imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + offset)); // B
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  };

  // Helper for contrast
  const adjustContrast = (contrast: number) => { // contrast: -100 to 100
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    
    ctx.drawImage(sourceCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = Math.min(255, Math.max(0, factor * (imgData.data[i] - 128) + 128));
      imgData.data[i+1] = Math.min(255, Math.max(0, factor * (imgData.data[i+1] - 128) + 128));
      imgData.data[i+2] = Math.min(255, Math.max(0, factor * (imgData.data[i+2] - 128) + 128));
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  };

  // Helper for rotation
  const rotateCanvas = (degrees: number) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    
    ctx.translate(width/2, height/2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(sourceCanvas, -width/2, -height/2);
    return c;
  };

  // 2. Brightness Up (+30)
  const brightUp = adjustBrightness(30);

  // 3. Brightness Down (-30)
  const brightDown = adjustBrightness(-30);

  // 4. Contrast Up
  const contrastUp = adjustContrast(30);

  // 5. Rotation (+10 deg)
  const rotPlus = rotateCanvas(10);

  // 6. Rotation (-10 deg)
  const rotMinus = rotateCanvas(-10);

  return [flipCanvas, brightUp, brightDown, contrastUp, rotPlus, rotMinus];
}
