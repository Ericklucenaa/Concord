import React, { useEffect, useState } from 'react';
import { MicOff, HeadphoneOff } from 'lucide-react';

// Rendered in the transparent, click-through overlay window (#overlay).
export default function OverlayApp() {
  const [state, setState] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add('overlay-root');
    return window.electronAPI?.onOverlayState?.(setState);
  }, []);

  if (!state?.users?.length) return null;

  return (
    <div className="overlay-panel">
      <div className="overlay-channel">🔊 {state.channel}</div>
      {state.users.map((u) => (
        <div key={u.id} className={`overlay-user ${u.speaking ? 'speaking' : ''}`}>
          {u.avatar ? <img src={u.avatar} alt="" /> : <span className="overlay-avatar-fallback">{u.username.slice(0, 1).toUpperCase()}</span>}
          <span className="overlay-name">{u.username}</span>
          {u.deafened ? <HeadphoneOff size={13} /> : u.muted && <MicOff size={13} />}
        </div>
      ))}
    </div>
  );
}
