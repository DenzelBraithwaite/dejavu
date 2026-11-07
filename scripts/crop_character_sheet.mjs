/**
 * Split a transparent three-over-two character sheet into five 512-style portraits.
 *
 * This intentionally uses only Node built-ins so the art workflow does not depend
 * on platform-specific crop behavior or optional native image packages.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodePng, encodePng } from './lib/png_rgba.mjs';

const BYTES_PER_PIXEL = 4;
const OUTPUT_EMOTIONS = [
  ['neutral', 'neutral'],
  ['angry', 'angry'],
  ['shocked', 'shocked'],
  ['happy', 'happy'],
  ['sad', 'sad']
];

function cropPixels(source, rectangle) {
  const { x, y, width, height } = rectangle;
  const sourceRowLength = source.width * BYTES_PER_PIXEL;
  const cropRowLength = width * BYTES_PER_PIXEL;
  const cropped = Buffer.alloc(cropRowLength * height);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * sourceRowLength) + (x * BYTES_PER_PIXEL);
    const targetStart = row * cropRowLength;

    source.pixels.copy(
      cropped,
      targetStart,
      sourceStart,
      sourceStart + cropRowLength
    );
  }

  return cropped;
}

function createCropLayout(width, height) {
  const portraitWidth = Math.round(width / 3);
  const portraitHeight = Math.floor(height / 2);
  const centeredLeft = Math.floor((width / 2 - portraitWidth) / 2);

  if (portraitWidth !== portraitHeight) {
    throw new Error(
      `Expected square portraits in a 3:2 sheet, received ${width}x${height}.`
    );
  }

  return {
    neutral: { x: 0, y: 0, width: portraitWidth, height: portraitHeight },
    angry: { x: portraitWidth, y: 0, width: portraitWidth, height: portraitHeight },
    shocked: { x: portraitWidth * 2, y: 0, width: portraitWidth, height: portraitHeight },
    happy: { x: centeredLeft, y: portraitHeight, width: portraitWidth, height: portraitHeight },
    sad: {
      x: Math.floor(width / 2) + centeredLeft,
      y: portraitHeight,
      width: portraitWidth,
      height: portraitHeight
    }
  };
}

function main() {
  const [sourcePath, outputDirectory, requestedStem] = process.argv.slice(2);

  if (!sourcePath || !outputDirectory) {
    throw new Error(
      'Usage: node scripts/crop_character_sheet.mjs <sheet.png> <output-directory> [file-stem]'
    );
  }

  const source = decodePng(readFileSync(sourcePath));
  const layout = createCropLayout(source.width, source.height);
  const fileStem = requestedStem ?? basename(sourcePath, '.png').toLowerCase();

  mkdirSync(outputDirectory, { recursive: true });

  for (const [outputEmotion, sourceEmotion] of OUTPUT_EMOTIONS) {
    const rectangle = layout[sourceEmotion];
    const croppedPixels = cropPixels(source, rectangle);
    const outputPath = join(outputDirectory, `${fileStem}_${outputEmotion}.png`);

    writeFileSync(
      outputPath,
      encodePng(rectangle.width, rectangle.height, croppedPixels)
    );

    console.log(`Created ${outputPath}`);
  }
}

main();
