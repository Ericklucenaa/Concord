import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Info, 
  X, 
  AlertCircle,
  Sparkles
} from 'lucide-react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  // Modal Dialog State (replaces native alert and confirm)
  const [dialogState, setDialogState] = useState(null); // { isOpen, type, title, message, confirmText, cancelText, onConfirm, onCancel, isDanger }

  // Toasts State
  const [toasts, setToasts] = useState([]); // Array of { id, type, title, message }

  // Toast helper
  const showToast = useCallback((message, type = 'info', title = '', duration = 4000) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  // Custom in-app Alert Modal
  const showAlert = useCallback((title, message, type = 'info') => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type,
        title: title || 'Aviso',
        message,
        confirmText: 'OK',
        cancelText: null,
        onConfirm: () => {
          setDialogState(null);
          resolve(true);
        },
        onCancel: () => {
          setDialogState(null);
          resolve(true);
        }
      });
    });
  }, []);

  // Custom in-app Confirm Modal
  const showConfirm = useCallback((title, message, { confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false, type = 'warning' } = {}) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: isDanger ? 'danger' : type,
        title: title || 'Confirmação',
        message,
        confirmText,
        cancelText,
        isDanger,
        onConfirm: () => {
          setDialogState(null);
          resolve(true);
        },
        onCancel: () => {
          setDialogState(null);
          resolve(false);
        }
      });
    });
  }, []);

  // Success helper
  const showSuccess = useCallback((title, message) => {
    return showAlert(title, message, 'success');
  }, [showAlert]);

  // Error helper
  const showError = useCallback((title, message) => {
    return showAlert(title, message, 'error');
  }, [showAlert]);

  const closeDialog = useCallback(() => {
    if (dialogState?.onCancel) {
      dialogState.onCancel();
    }
    setDialogState(null);
  }, [dialogState]);

  return (
    <NotificationContext.Provider
      value={{
        showAlert,
        showConfirm,
        showSuccess,
        showError,
        showToast
      }}
    >
      {children}

      {/* In-App Custom Modal Dialog */}
      {dialogState && dialogState.isOpen && (
        <div 
          className="custom-dialog-overlay"
          onClick={closeDialog}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fadeIn 0.15s ease'
          }}
        >
          <div 
            className="custom-dialog-box"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '440px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary)',
              border: `1px solid ${
                dialogState.type === 'danger' 
                  ? 'rgba(239, 68, 68, 0.4)' 
                  : dialogState.type === 'success' 
                  ? 'rgba(16, 185, 129, 0.4)' 
                  : 'var(--border-color)'
              }`,
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
              animation: 'slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Header / Icon */}
            <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: dialogState.type === 'danger'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : dialogState.type === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : dialogState.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)',
                color: dialogState.type === 'danger'
                  ? 'var(--accent-danger)'
                  : dialogState.type === 'success'
                  ? 'var(--accent-success)'
                  : dialogState.type === 'warning'
                  ? 'var(--accent-warning)'
                  : 'var(--accent-primary)'
              }}>
                {dialogState.type === 'danger' && <AlertTriangle size={22} />}
                {dialogState.type === 'success' && <CheckCircle size={22} />}
                {dialogState.type === 'warning' && <AlertCircle size={22} />}
                {dialogState.type === 'info' && <Info size={22} />}
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                  {dialogState.title}
                </h3>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {dialogState.message}
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div 
              style={{
                padding: '16px 24px',
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                borderTop: '1px solid var(--border-color)',
                marginTop: 12
              }}
            >
              {dialogState.cancelText && (
                <button 
                  className="btn btn-secondary"
                  onClick={dialogState.onCancel}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
                >
                  {dialogState.cancelText}
                </button>
              )}

              <button 
                className={`btn ${dialogState.isDanger ? 'btn-danger' : 'btn-primary'}`}
                onClick={dialogState.onConfirm}
                autoFocus
                style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700 }}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-App Toasts */}
      <div 
        className="toast-container"
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 10001,
          pointerEvents: 'none'
        }}
      >
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-secondary)',
              border: `1px solid ${
                toast.type === 'success' 
                  ? 'rgba(16, 185, 129, 0.5)' 
                  : toast.type === 'error' 
                  ? 'rgba(239, 68, 68, 0.5)' 
                  : 'var(--border-color)'
              }`,
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              pointerEvents: 'auto',
              animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              maxWidth: 380
            }}
          >
            {toast.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />}
            {toast.type === 'error' && <XCircle size={18} style={{ color: 'var(--accent-danger)', flexShrink: 0 }} />}
            {toast.type === 'info' && <Info size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
            <div>{toast.message}</div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
