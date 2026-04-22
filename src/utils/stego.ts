const DELIMITER = "\u0000STEGO_END\u0000";

export function encodeMessage(imageData: ImageData, message: string): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const fullMessage = message + DELIMITER;
  const binary = toBinary(fullMessage);
  const capacity = Math.floor((data.length / 4) * 3);

  if (binary.length > capacity) {
    const maxChars = Math.floor(capacity / 8) - DELIMITER.length;
    throw new Error(`Image too small. Max capacity: ~${maxChars} characters.`);
  }

  let bitIndex = 0;
  for (let i = 0; i < data.length && bitIndex < binary.length; i++) {
    if ((i + 1) % 4 === 0) continue;
    data[i] = (data[i] & 0b11111110) | parseInt(binary[bitIndex]);
    bitIndex++;
  }

  return new ImageData(data, imageData.width, imageData.height);
}

export function decodeMessage(imageData: ImageData): string {
  const data = imageData.data;
  let binary = "";

  for (let i = 0; i < data.length; i++) {
    if ((i + 1) % 4 === 0) continue;
    binary += (data[i] & 1).toString();
  }

  const text = fromBinary(binary);
  const idx = text.indexOf(DELIMITER);
  if (idx === -1) throw new Error("No hidden message found in this image.");
  return text.slice(0, idx);
}

export function getCapacity(imageData: ImageData): number {
  const capacity = Math.floor((imageData.data.length / 4) * 3);
  return Math.floor(capacity / 8) - 20;
}

function toBinary(text: string): string {
  return Array.from(text)
    .map(c => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("");
}

function fromBinary(binary: string): string {
  let result = "";
  for (let i = 0; i + 8 <= binary.length; i += 8) {
    result += String.fromCharCode(parseInt(binary.slice(i, i + 8), 2));
  }
  return result;
}