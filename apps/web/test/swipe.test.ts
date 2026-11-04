import { afterEach, describe, expect, it, vi } from 'vitest';
import { followTransform, startsASwipe, swipe, swipeOutcome } from '../src/lib/swipe.ts';

/** The swipe on the front card: where it starts counting, when it sets aside, what it leaves alone. */
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function pointer(node: Element, type: string, x: number, y: number, pointerId = 1) {
  node.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, pointerId, bubbles: true, cancelable: true }),
  );
}

/** A front card: the button itself, with a question, a field and a button inside it. */
function card(): { node: HTMLButtonElement; dismissed: string[]; clicks: number[] } {
  const node = document.createElement('button');
  node.innerHTML = '<p>Question</p><textarea></textarea><a href="#talk">Talk</a><span>Save</span>';
  document.body.append(node);
  const dismissed: string[] = [];
  const clicks: number[] = [];
  node.addEventListener('click', () => clicks.push(1));
  swipe(node, { onDismiss: (direction) => dismissed.push(direction) });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') }));
  return { node, dismissed, clicks };
}

describe('the swipe threshold', () => {
  it('is more than 100 pixels sideways at release', () => {
    expect(swipeOutcome(100)).toBe('cancel');
    expect(swipeOutcome(101)).toBe('dismiss');
    expect(swipeOutcome(-101)).toBe('dismiss');
    expect(swipeOutcome(0)).toBe('cancel');
  });

  it('a pointer in the answer field, a link or a control inside the card is not a swipe; the card itself, a button, is', () => {
    const { node } = card();
    expect(startsASwipe(node, node)).toBe(true);
    expect(startsASwipe(node.querySelector('p'), node)).toBe(true);
    expect(startsASwipe(node.querySelector('textarea'), node)).toBe(false);
    expect(startsASwipe(node.querySelector('a'), node)).toBe(false);
    const inner = document.createElement('button');
    node.append(inner);
    expect(startsASwipe(inner, node)).toBe(false);
    expect(startsASwipe(null, node)).toBe(true);
  });

  it('follows the pointer and turns one degree for every 18 pixels', () => {
    expect(followTransform(90)).toBe('translateX(90px) rotate(5deg)');
    expect(followTransform(-180)).toBe('translateX(-180px) rotate(-10deg)');
  });
});

describe('swiping a card', () => {
  it('sets the card aside past the threshold, to the left or to the right', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 150, 102);
    pointer(node, 'pointermove', 80, 104);
    pointer(node, 'pointerup', 80, 104);
    expect(dismissed).toEqual(['left']);
    pointer(node, 'pointerdown', 100, 100);
    pointer(node, 'pointermove', 221, 100);
    pointer(node, 'pointerup', 221, 100);
    expect(dismissed).toEqual(['left', 'right']);
  });

  it('springs back at 100 pixels or less and records nothing', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 100, 100);
    expect(node.style.transform).toBe(followTransform(-100));
    pointer(node, 'pointerup', 100, 100);
    expect(dismissed).toEqual([]);
    expect(node.style.transform).toBe('');
  });

  it('leaves a vertical movement to the scroll', () => {
    const { node, dismissed } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 205, 140);
    pointer(node, 'pointermove', 60, 400);
    pointer(node, 'pointerup', 60, 400);
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

  it('a drag of more than 6 pixels swallows the click that would open the card; a tap does not', () => {
    const { node, clicks } = card();
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 207, 100);
    pointer(node, 'pointerup', 207, 100);
    node.click();
    expect(clicks).toEqual([]);
    pointer(node, 'pointerdown', 200, 100);
    pointer(node, 'pointermove', 205, 100);
    pointer(node, 'pointerup', 205, 100);
    node.click();
    expect(clicks).toEqual([1]);
    // Enter on the keyboard is a click with no pointer before it.
    node.click();
    expect(clicks).toEqual([1, 1]);
  });

  it('is off while the caller says so', () => {
    const node = document.createElement('button');
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
