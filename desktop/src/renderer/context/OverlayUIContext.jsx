import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ProfileCard from '../components/ProfileCard';

// App-wide floating UI: right-click context menus and user profile cards.
const OverlayUIContext = createContext(null);

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
      x: Math.min(menu.x, innerWidth - rect.width - 8),
      y: Math.min(menu.y, innerHeight - rect.height - 8)
    });
  }, [menu]);

  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu ui-context-menu" role="menu" style={{ position: 'fixed', top: pos.y, left: pos.x }}>
      {menu.title && <div className="ui-menu-title">{menu.title}</div>}
      {menu.items.filter(Boolean).map((item, i) => {
        if (item.separator) return <div key={`sep-${i}`} className="ui-menu-separator" />;
        if (item.heading) return <div key={`h-${i}`} className="ui-menu-heading">{item.heading}</div>;
        const Icon = item.icon;
        return (
          <button
            key={item.label}
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

export function OverlayUIProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const [profile, setProfile] = useState(null);

  const openMenu = useCallback((event, items, title) => {
    event.preventDefault();
    event.stopPropagation();
    setProfile(null);
    setMenu({ x: event.clientX, y: event.clientY, items, title });
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
