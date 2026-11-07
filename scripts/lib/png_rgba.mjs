import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BYTES_PER_PIXEL = 4;
const SUPPORTED_BIT_DEPTH = 8;
const SUPPORTED_COLOR_TYPE = 6;
const SUPPORTED_INTERLACE = 0;

function readChunks(fileBuffer) {
  const chunks = [];
  let offset = PNG_SIGNATURE.length;

  while (offset < fileBuffer.length) {
    const length = fileBuffer.readUInt32BE(offset);
    const type = fileBuffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    chunks.push({
      type,
      data: fileBuffer.subarray(dataStart, dataEnd)
    });

    offset = dataEnd + 4;
  }

  return chunks;
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  if (aboveDistance <= upperLeftDistance) {
    return above;
  }

  return upperLeft;
}

function decodeScanlines(compressedData, width, height) {
  const encoded = inflateSync(compressedData);
  const rowLength = width * BYTES_PER_PIXEL;
  const decoded = Buffer.alloc(rowLength * height);
  let encodedOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = encoded[encodedOffset];
    const rowOffset = y * rowLength;

    encodedOffset += 1;

    for (let x = 0; x < rowLength; x += 1) {
      const sourceValue = encoded[encodedOffset];
      const left = x >= BYTES_PER_PIXEL
        ? decoded[rowOffset + x - BYTES_PER_PIXEL]
        : 0;
      const above = y > 0
        ? decoded[rowOffset - rowLength + x]
        : 0;
      const upperLeft = y > 0 && x >= BYTES_PER_PIXEL
        ? decoded[rowOffset - rowLength + x - BYTES_PER_PIXEL]
        : 0;
      let decodedValue = sourceValue;

      if (filter === 1) {
        decodedValue += left;
      } else if (filter === 2) {
        decodedValue += above;
      } else if (filter === 3) {
        decodedValue += Math.floor((left + above) / 2);
      } else if (filter === 4) {
        decodedValue += paethPredictor(left, above, upperLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }

      decoded[rowOffset + x] = decodedValue & 255;
      encodedOffset += 1;
    }
  }

  return decoded;
}

function calculateCrc(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);

      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunkData = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(data.length + 12);

  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(calculateCrc(chunkData), data.length + 8);

  return chunk;
}

export function decodePng(fileBuffer) {
  const chunks = readChunks(fileBuffer);
  const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  const imageData = Buffer.concat(
    chunks
      .filter((chunk) => chunk.type === 'IDAT')
      .map((chunk) => chunk.data)
  );

  if (!fileBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Source file is not a PNG.');
  }

  if (!header) {
    throw new Error('PNG header is missing.');
  }

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const interlace = header[12];

  if (
    bitDepth !== SUPPORTED_BIT_DEPTH
    || colorType !== SUPPORTED_COLOR_TYPE
    || interlace !== SUPPORTED_INTERLACE
  ) {
    throw new Error(
      `Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`
    );
  }

  return {
    width,
    height,
    pixels: decodeScanlines(imageData, width, height)
  };
}

export function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  const rowLength = width * BYTES_PER_PIXEL;
  const scanlines = Buffer.alloc((rowLength + 1) * height);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = SUPPORTED_BIT_DEPTH;
  header[9] = SUPPORTED_COLOR_TYPE;
  header[10] = 0;
  header[11] = 0;
  header[12] = SUPPORTED_INTERLACE;

  for (let row = 0; row < height; row += 1) {
    const scanlineStart = row * (rowLength + 1);
    const pixelStart = row * rowLength;

    scanlines[scanlineStart] = 0;
    pixels.copy(scanlines, scanlineStart + 1, pixelStart, pixelStart + rowLength);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(scanlines)),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}
