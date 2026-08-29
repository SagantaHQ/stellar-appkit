import { test, expect, describe } from 'bun:test';
import {
  classifyIconSource,
  decodeBase64,
  decodeSvgDataUri,
  fallbackBackgroundColor,
} from '../src/ui/icon-utils.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#0d9ea5"/></svg>';
const SVG_B64 = Buffer.from(SVG, 'utf-8').toString('base64');

describe('classifyIconSource — every icon format the SDK ships', () => {
  test('PNG/JPEG/GIF/WebP data URIs render through RN Image', () => {
    expect(classifyIconSource('data:image/png;base64,iVBORw0KGgo=')).toBe('raster-data');
    expect(classifyIconSource('data:image/jpeg;base64,/9j/4AAQ=')).toBe('raster-data');
    expect(classifyIconSource('data:image/gif;base64,R0lGODlh=')).toBe('raster-data');
    expect(classifyIconSource('data:image/webp;base64,UklGR=')).toBe('raster-data');
  });

  test('SVG data URIs (base64 and utf8) route to SvgXml', () => {
    expect(classifyIconSource(`data:image/svg+xml;base64,${SVG_B64}`)).toBe('svg-data');
    expect(classifyIconSource('data:image/svg+xml;utf8,<svg xmlns="…"></svg>')).toBe('svg-data');
    expect(classifyIconSource('data:image/svg+xml,%3Csvg%3E')).toBe('svg-data');
  });

  test('remote URLs split by svg-ness', () => {
    expect(classifyIconSource('https://imagedelivery.net/w/64')).toBe('raster-url');
    expect(classifyIconSource('https://example.com/icon.svg')).toBe('svg-url');
    expect(classifyIconSource('https://example.com/icon.svg?v=2')).toBe('svg-url');
    expect(classifyIconSource('https://example.com/icon.svg#x')).toBe('svg-url');
    expect(classifyIconSource('http://example.com/icon.svg')).toBe('svg-url');
  });

  test('garbage and empty sources fall through to the letter avatar', () => {
    expect(classifyIconSource('')).toBe('none');
    expect(classifyIconSource('javascript:alert(1)')).toBe('none');
    expect(classifyIconSource('data:text/plain;base64,aGk=')).toBe('none');
  });
});

describe('decodeBase64 — pure JS, no Buffer/atob dependency', () => {
  test('known ASCII vectors', () => {
    expect(decodeBase64('SGVsbG8=')).toBe('Hello');
    expect(decodeBase64('')).toBe('');
  });

  test('decodes the multi-byte UTF-8 inside wallet SVGs', () => {
    // 'é' = 0xC3 0xA9, '‰' is a single-byte-ish continuation sample
    expect(decodeBase64(Buffer.from('é', 'utf-8').toString('base64'))).toBe('é');
    expect(decodeBase64(SVG_B64)).toBe(SVG);
  });

  test('ignores whitespace/newlines embedded by formatters', () => {
    expect(decodeBase64(Buffer.from('Stellar', 'utf-8').toString('base64').replace(/(.{2})/g, '$1\n'))).toBe('Stellar');
  });
});

describe('decodeSvgDataUri', () => {
  test('base64 SVG payload round-trips to the XML text', () => {
    expect(decodeSvgDataUri(`data:image/svg+xml;base64,${SVG_B64}`)).toBe(SVG);
  });

  test('URL-encoded utf8 payload decodes', () => {
    const encoded = encodeURIComponent(SVG);
    expect(decodeSvgDataUri(`data:image/svg+xml,${encoded}`)).toBe(SVG);
  });

  test('non-XML payloads and missing commas return null', () => {
    expect(decodeSvgDataUri(`data:image/svg+xml;base64,${Buffer.from('hello', 'utf-8').toString('base64')}`)).toBeNull();
    expect(decodeSvgDataUri('data:image/svg+xml')).toBeNull();
  });
});

describe('fallbackBackgroundColor — stable per wallet name', () => {
  test('same name → same color', () => {
    expect(fallbackBackgroundColor('Freighter')).toBe(fallbackBackgroundColor('Freighter'));
  });

  test('produces an hsl() color string', () => {
    expect(fallbackBackgroundColor('LOBSTR')).toMatch(/^hsl\(\d+, 45%, 38%\)$/);
  });
});
