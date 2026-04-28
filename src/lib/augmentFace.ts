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

  // 2. Brightness Up (+30)
  const brightUp = adjustBrightness(30);

  // 3. Brightness Down (-30)
  const brightDown = adjustBrightness(-30);

  return [flipCanvas, brightUp, brightDown];
}
