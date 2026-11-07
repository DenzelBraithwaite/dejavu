/**
 * Re-map the legacy magenta/cyan portrait lighting to a faction palette.
 *
 * The transform only touches highly saturated neon pixels. This preserves skin,
 * hair, wounds, clothing, transparency, and powered-off displays exactly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png_rgba.mjs';

const BYTES_PER_PIXEL = 4;
const MINIMUM_SATURATION = 0.34;
const MINIMUM_VALUE = 0.18;
const PALETTES = {
  spoofs: {
    magenta: { hue: 128, saturationScale: 1 },
    blue: { hue: 0, saturationScale: 0.05 },
    cyan: { hue: 0, saturationScale: 0.05 }
  },
  four04s: {
    magenta: { hue: 48, saturationScale: 1 },
    blue: { hue: 0, saturationScale: 0.05 },
    cyan: { hue: 0, saturationScale: 0.05 }
  },
  rammers: {
    magenta: { hue: 0, saturationScale: 1 },
    blue: { hue: 28, saturationScale: 1 },
    cyan: { hue: 28, saturationScale: 1 }
  },
  acpu: {
    magenta: { hue: 220, saturationScale: 1 },
    blue: { hue: 220, saturationScale: 1 },
    cyan: { hue: 184, saturationScale: 1 }
  },
  raid: {
    magenta: { hue: 326, saturationScale: 1 },
    blue: { hue: 276, saturationScale: 1 },
    cyan: { hue: 276, saturationScale: 1 }
  },
  factionless: {
    magenta: { hue: 0, saturationScale: 0.58 },
    blue: { hue: 0, saturationScale: 0.05 },
    cyan: { hue: 0, saturationScale: 0.05 }
  },
  poe: {
    magenta: { hue: 28, saturationScale: 1 },
    blue: { hue: 50, saturationScale: 1 },
    cyan: { hue: 50, saturationScale: 1 }
  },
  zara: {
    magenta: { hue: 128, saturationScale: 1 },
    blue: { hue: 220, saturationScale: 1 },
    cyan: { hue: 184, saturationScale: 1 }
  }
};

function rgbToHsv(red, green, blue) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const range = maximum - minimum;
  let hue = 0;

  if (range > 0 && maximum === normalizedRed) {
    hue = 60 * (((normalizedGreen - normalizedBlue) / range) % 6);
  } else if (range > 0 && maximum === normalizedGreen) {
    hue = 60 * (((normalizedBlue - normalizedRed) / range) + 2);
  } else if (range > 0) {
    hue = 60 * (((normalizedRed - normalizedGreen) / range) + 4);
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: maximum === 0 ? 0 : range / maximum,
    value: maximum
  };
}

function hsvToRgb(hue, saturation, value) {
  const chroma = value * saturation;
  const section = hue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  const match = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) {
    red = chroma;
    green = intermediate;
  } else if (section < 2) {
    red = intermediate;
    green = chroma;
  } else if (section < 3) {
    green = chroma;
    blue = intermediate;
  } else if (section < 4) {
    green = intermediate;
    blue = chroma;
  } else if (section < 5) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255)
  ];
}

function identifySourceLight(hue) {
  if (hue >= 285 && hue <= 350) {
    return 'magenta';
  }

  if (hue >= 160 && hue < 220) {
    return 'cyan';
  }

  if (hue >= 220 && hue < 285) {
    return 'blue';
  }

  return null;
}

function recolorPixels(pixels, palette) {
  const output = Buffer.from(pixels);

  for (let offset = 0; offset < output.length; offset += BYTES_PER_PIXEL) {
    const alpha = output[offset + 3];

    if (alpha === 0) {
      continue;
    }

    const color = rgbToHsv(output[offset], output[offset + 1], output[offset + 2]);
    const sourceLight = identifySourceLight(color.hue);

    if (
      !sourceLight
      || color.saturation < MINIMUM_SATURATION
      || color.value < MINIMUM_VALUE
    ) {
      continue;
    }

    const target = palette[sourceLight];
    const targetSaturation = Math.min(1, color.saturation * target.saturationScale);
    const [red, green, blue] = hsvToRgb(
      target.hue,
      targetSaturation,
      color.value
    );

    output[offset] = red;
    output[offset + 1] = green;
    output[offset + 2] = blue;
  }

  return output;
}

function main() {
  const [sourcePath, paletteName, outputPath = sourcePath] = process.argv.slice(2);
  const palette = PALETTES[paletteName];

  if (!sourcePath || !palette) {
    throw new Error(
      `Usage: node scripts/recolor_character_portrait.mjs <portrait.png> <${Object.keys(PALETTES).join('|')}> [output.png]`
    );
  }

  const image = decodePng(readFileSync(sourcePath));
  const recoloredPixels = recolorPixels(image.pixels, palette);

  writeFileSync(
    outputPath,
    encodePng(image.width, image.height, recoloredPixels)
  );

  console.log(`Recolored ${outputPath} with ${paletteName}.`);
}

main();
