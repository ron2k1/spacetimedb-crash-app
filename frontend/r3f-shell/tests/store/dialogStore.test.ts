import { describe, it, expect, beforeEach } from 'vitest';
import { useDialogStore } from '../../src/store/dialogStore';

describe('dialogStore', () => {
  beforeEach(() => {
    useDialogStore.setState({ open: false, prompt: '' });
  });
  it('starts closed with empty prompt', () => {
    expect(useDialogStore.getState().open).toBe(false);
    expect(useDialogStore.getState().prompt).toBe('');
  });
  it('opens via setOpen(true)', () => {
    useDialogStore.getState().setOpen(true);
    expect(useDialogStore.getState().open).toBe(true);
  });
  it('updates prompt', () => {
    useDialogStore.getState().setPrompt('hello');
    expect(useDialogStore.getState().prompt).toBe('hello');
  });
  it('resets prompt + closes on submit', () => {
    useDialogStore.setState({ open: true, prompt: 'do thing' });
    useDialogStore.getState().reset();
    expect(useDialogStore.getState().open).toBe(false);
    expect(useDialogStore.getState().prompt).toBe('');
  });
});
