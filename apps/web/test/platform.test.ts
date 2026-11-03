import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../src/lib/platform.ts';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOld:
    'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  chromeos:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
};

describe('the dictation hint is picked by platform', () => {
  it('an iPhone and an iPad get the keyboard microphone hint', () => {
    expect(detectPlatform(UA.iphone)).toBe('iPhone and iPad');
    expect(detectPlatform(UA.ipadOld)).toBe('iPhone and iPad');
  });

  it('an iPad that calls itself a Mac is told apart by its touch points', () => {
    expect(detectPlatform(UA.ipadAsMac, 5)).toBe('iPhone and iPad');
    expect(detectPlatform(UA.ipadAsMac, 0)).toBe('Mac');
  });

  it('Android, Mac, Windows and ChromeOS get their own hint', () => {
    expect(detectPlatform(UA.android)).toBe('Android');
    expect(detectPlatform(UA.mac)).toBe('Mac');
    expect(detectPlatform(UA.windows)).toBe('Windows');
    expect(detectPlatform(UA.chromeos)).toBe('ChromeOS');
  });

  it('Linux and anything unknown get no hint at all', () => {
    expect(detectPlatform(UA.linux)).toBeNull();
    expect(detectPlatform('')).toBeNull();
    expect(detectPlatform('Mozilla/5.0 (darwin) jsdom/26.0.0')).toBeNull();
  });
});
