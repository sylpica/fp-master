import { describe, expect, it } from 'vitest';
import { decodeBase64ToBytes } from '../../src/lib/summaryPdf';

describe('decodeBase64ToBytes', () => {
  it('PDFマジックを含むバイト列を復元する', () => {
    // "%PDF-1.7" の Base64
    const bytes = decodeBase64ToBytes('JVBERi0xLjc=');
    expect(String.fromCharCode(...bytes)).toBe('%PDF-1.7');
  });
  it('空白・改行が混じっても復元できる', () => {
    const bytes = decodeBase64ToBytes('JVBE Ri0x\nLjc=\r\n');
    expect(String.fromCharCode(...bytes)).toBe('%PDF-1.7');
  });
  it('往復変換で元のバイト列に戻る', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 10, 13, 255]);
    let bin = '';
    for (const b of original) bin += String.fromCharCode(b);
    const bytes = decodeBase64ToBytes(btoa(bin));
    expect([...bytes]).toEqual([...original]);
  });
});
