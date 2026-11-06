// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAGE_MIME } from '../../lib/pages';
import { Sidebar } from './Sidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const mount = () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Sidebar />));
};
const unmount = () => {
  act(() => root.unmount());
  host.remove();
};

/** The folding button of a section, by its English title. */
const section = (key: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.side-section-toggle')].find((b) => b.textContent === key)!;
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('sidebar sections', () => {
  beforeEach(() => {
    localStorage.clear();
    mount();
  });
  afterEach(unmount);

  it('folds a section and hides its pages', () => {
    expect(section('Recent').getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('No pages yet');
    click(section('Recent'));
    expect(section('Recent').getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('No pages yet');
  });

  it('keeps a section folded across sessions', () => {
    click(section('Recent'));
    unmount();
    mount();
    expect(section('Recent').getAttribute('aria-expanded')).toBe('false');
    expect(section('Folders').getAttribute('aria-expanded')).toBe('true');
  });

  it('opens Folders when asked for a new folder', () => {
    click(section('Folders'));
    click(host.querySelector('[aria-label="New folder"]')!);
    expect(section('Folders').getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.side-input input')).not.toBeNull();
  });

  it('opens a folded section when a page is dragged onto its name', () => {
    click(section('Folders'));
    const drag = new Event('dragenter', { bubbles: true });
    Object.defineProperty(drag, 'dataTransfer', { value: { types: [PAGE_MIME] } });
    act(() => section('Folders').dispatchEvent(drag));
    expect(section('Folders').getAttribute('aria-expanded')).toBe('true');
  });

  it('starts open when the stored value is unreadable', () => {
    unmount();
    localStorage.setItem('tadween.sidebar.closed', 'not json');
    mount();
    expect(section('Recent').getAttribute('aria-expanded')).toBe('true');
  });
});
