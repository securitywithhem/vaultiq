import { useEffect } from 'react';

/**
 * Global keyboard shortcuts:
 *  '/'        → focus the search input
 *  'Escape'   → call onEscape (close modal / exit bulk mode)
 *  'Delete'   → call onDelete (bulk delete when in selection mode)
 */
export const useKeyboardShortcuts = ({ searchRef, onEscape, onDelete } = {}) => {
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchRef?.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        onDelete?.();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchRef, onEscape, onDelete]);
};
