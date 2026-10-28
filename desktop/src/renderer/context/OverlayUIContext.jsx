import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ProfileCard from '../components/ProfileCard';

// App-wide floating UI: right-click context menus and user profile cards.
const OverlayUIContext = createContext(null);

/**
 * Menu items: { label, icon, onClick, danger, disabled, checked, hint }
 * plus { separator }, { heading }, { slider: { value, min, max, step, format,
 * onChange } } (does not close the menu) and { emojis: [...], onPick }.
 */
function ContextMenu({ menu, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8))
    });
  }, [menu]);

  // Keyboard: focus moves into the menu; arrows/Home/End move, Enter/Space
  // activate (native button behaviour), Esc closes.
  useEffect(() => {
    const items = () => [...(ref.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (menu.fromKeyboard) items()[0]?.focus();
    else ref.current?.focus();
  }, [menu]);

  const onKeyDown = (e) => {
    const list = [...ref.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const idx = list.indexOf(document.activeElement);
    const move = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') move(idx + 1);
    else if (e.key === 'ArrowUp') move(idx < 0 ? list.length - 1 : idx - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(list.length - 1);
    else if (e.key === 'Tab') { e.preventDefault(); move(idx + (e.shiftKey ? -1 : 1)); }
  };

  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="context-menu ui-context-menu"
      role="menu"
      aria-label={menu.title || 'Ações'}
      style={{ position: 'fixed', top: pos.y, left: pos.x }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.title && <div className="ui-menu-title">{menu.title}</div>}
      {menu.items.filter(Boolean).map((item, i) => {
        if (item.separator) return <div key={`sep-${i}`} className="ui-menu-separator" role="separator" />;
        if (item.heading) return <div key={`h-${i}`} className="ui-menu-heading">{item.heading}</div>;
        if (item.slider) return <MenuSlider key={`s-${i}`} item={item} />;
        if (item.emojis) {
          return (
            <div key={`e-${i}`} className="ui-menu-emojis">
              {item.emojis.map((emoji) => (
                <button
                  key={emoji}
                  role="menuitem"
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => {
                    onClose();
                    item.onPick(emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          );
        }
        const Icon = item.icon;
        return (
          <button
            key={`${item.label}-${i}`}
            role="menuitem"
            className={`dropdown-item ${item.danger ? 'danger' : ''} ${item.checked ? 'checked' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {Icon && <Icon size={15} />}
            <span>{item.label}</span>
            {item.hint && <span className="ui-menu-hint">{item.hint}</span>}
            {item.checked && <span className="ui-menu-check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function MenuSlider({ item }) {
  const { label, value, min = 0, max = 100, step = 1, format = (v) => v, onChange } = item.slider;
  const [current, setCurrent] = useState(value);
  return (
    <label className="ui-menu-slider">
      <span>{label}<em>{format(current)}</em></span>
      <input
        type="range"
        role="menuitem"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => {
          const v = Number(e.target.value);
          setCurrent(v);
          onChange(v);
        }}
      />
    </label>
  );
}

export function OverlayUIProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const [profile, setProfile] = useState(null);

  const openMenu = useCallback((event, items, title) => {
    event.preventDefault();
    event.stopPropagation();
    setProfile(null);
    // Opened from the keyboard (context-menu key / Shift+F10) there is no
    // pointer position: anchor to the focused element instead.
    const fromKeyboard = !event.clientX && !event.clientY;
    const rect = fromKeyboard ? event.currentTarget?.getBoundingClientRect?.() : null;
    setMenu({
      x: rect ? rect.left + 12 : event.clientX,
      y: rect ? rect.bottom - 4 : event.clientY,
      items,
      title,
      fromKeyboard
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  /** Shows the profile card of `userId` next to the clicked element. */
  const openProfile = useCallback((userId, event, extra = {}) => {
    event?.stopPropagation?.();
    const rect = event?.currentTarget?.getBoundingClientRect?.() || { right: window.innerWidth / 2, top: 120, left: window.innerWidth / 2 };
    setMenu(null);
    setProfile({ userId, rect, ...extra });
  }, []);

  const closeProfile = useCallback(() => setProfile(null), []);

  return (
    <OverlayUIContext.Provider value={{ openMenu, closeMenu, openProfile, closeProfile }}>
      {children}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {profile && <ProfileCard {...profile} onClose={closeProfile} />}
    </OverlayUIContext.Provider>
  );
}

export function useOverlayUI() {
  return useContext(OverlayUIContext);
}
