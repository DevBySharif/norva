/* eslint-disable @typescript-eslint/no-require-imports */
function makeGlb() {
  // Quad: 4 positions (VEC3f), 6 indices (UInt16), one PBR material.
  const positions = [
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  ]; // 48 bytes
  const indices = [0, 1, 2, 0, 2, 3]; // 12 bytes
  const binLength = 48 + 12; // 60
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "dev-fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0, mode: 4, material: 0 }] }],
    materials: [{ name: "Dev Demo Clay", pbrMetallicRoughness: { baseColorFactor: [0.835, 0.475, 0.357, 1] } }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12, target: 34963 },
      { buffer: 0, byteOffset: 12, byteLength: 48, target: 34962 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5123, count: 6, type: "SCALAR", min: [0], max: [5] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    ],
  });
  const jsonBuf = Buffer.from(json + " ".repeat((4 - (json.length % 4)) % 4), "ascii");
  const bin = Buffer.alloc(binLength);
  indices.forEach((v, i) => bin.writeUInt16LE(v, i * 2));
  positions.forEach((v, i) => bin.writeFloatLE(v, 12 + i * 4));
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jsonChunk = Buffer.alloc(8); jsonChunk.writeUInt32LE(jsonBuf.length, 0); jsonChunk.writeUInt32LE(0x4e4f534a, 4);
  const binChunk = Buffer.alloc(8); binChunk.writeUInt32LE(bin.length, 0); binChunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, jsonBuf, binChunk, bin]);
}

const fs = require("fs");
const path = require("path");
fs.mkdirSync(path.join(__dirname, "fixtures"), { recursive: true });
const out = path.join(__dirname, "fixtures", "demo-ceramic.glb");
fs.writeFileSync(out, makeGlb());
console.log("wrote", out, fs.statSync(out).size, "bytes");