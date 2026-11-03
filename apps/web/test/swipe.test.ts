import { afterEach, describe, expect, it, vi } from 'vitest';
import { startsASwipe, swipe, swipeOutcome } from '../src/lib/swipe.ts';

/** The swipe on a card: where it starts counting, when it sets aside, what it leaves alone. */
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function pointer(node: Element, type: string, x: number, y: number, pointerId = 1) {
  node.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId, bubbles: true, cancelable: true }),
  );
}

function card(): { node: HTMLDivElement; dismissed: string[] } {
  const node = document.createElement('div');
  node.innerHTML = '<p>Question</p><textarea></textarea><button>Save</button>';
  document.body.append(node);
  const dismissed: string[] = [];
  swipe(node, { onDismiss: (direction) => dismissed.push(direction) });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  return { node, dismissed };
}

describe('the swipe threshold', () => {
  it('is 80 pixels on a narrow card and 35% of the width on a wide one', () => {
    expect(swipeOutcome(79, 200)).toBe('cancel');
    expect(swipeOutcome(80, 200)).toBe('dismiss');
    expect(swipeOutcome(-80, 200)).toBe('dismiss');
    expect(swipeOutcome(100, 400)).toBe('cancel');
    expect(swipeOutcome(140, 400)).toBe('dismiss');
  });

  it('a touch in the answer field or on a button is not a swipe', () => {
    const { node } = card();
    expect(startsASwipe(node)).toBe(true);
    expect(startsASwipe(node.querySelector('p'))).toBe(true);
    expect(startsASwipe(node.querySelector('textarea'))).toBe(false);
    expect(startsASwipe(node.querySelector('button'))).toBe(false);
    expect(startsASwipe(null)).toBe(true);
  });
});

describe('swiping a card', () => {
  it('sets the card aside past the threshold, to the left or to the right', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 150, 102);
    pointer(node, 'pointermove', 100, 104);
    pointer(node, 'pointerup', 100, 104);
    expect(dismissed).toEqual(['left']);
    pointer(node, 'pointerdown', 100, 100);
    pointer(node, 'pointermove', 200, 100);
    pointer(node, 'pointerup', 200, 100);
    expect(dismissed).toEqual(['left', 'right']);
  });

  it('springs back short of the threshold and records nothing', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 160, 100);
    pointer(node, 'pointerup', 160, 100);
    expect(dismissed).toEqual([]);
    expect(node.style.transform).toBe('');
  });

  it('leaves a vertical movement to the scroll', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 205, 140);
    pointer(node, 'pointermove', 100, 400);
    pointer(node, 'pointerup', 100, 400);
    expect(dismissed).toEqual([]);
  });

  it('does not start in the answer field', () => {
    const { node, dismissed } = card();
    const field = node.querySelector('textarea')!;
    pointer(field, 'pointerdown', 200, 100);
    pointer(field, 'pointermove', 50, 100);
    pointer(field, 'pointerup', 50, 100);
    expect(dismissed).toEqual([]);
  });

  it('is off while the caller says so', () => {
    const node = document.createElement('div');
    document.body.append(node);
    const dismissed: string[] = [];
    let enabled = false;
    swipe(node, { onDismiss: (d) => dismissed.push(d), enabled: () => enabled });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 50, 100);
    pointer(node, 'pointerup', 50, 100);
    expect(dismissed).toEqual([]);
    enabled = true;
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 50, 100);
    pointer(node, 'pointerup', 50, 100);
    expect(dismissed).toEqual(['left']);
  });
});
