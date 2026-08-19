import React, { useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

export default function ImageLightboxModal({ imageUrl, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div 
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={imageUrl} 
          alt="Imagem em tamanho original" 
          style={{
            maxWidth: '90vw',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        />

        {/* Toolbar */}
        <div 
          style={{
            position: 'absolute',
            top: -48,
            right: 0,
            display: 'flex',
            gap: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}
        >
          <a 
            href={imageUrl} 
            download={`concord_image_${Date.now()}.png`} 
            target="_blank" 
            rel="noreferrer"
            className="icon-btn"
            title="Baixar Imagem"
            style={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: 4 }}
          >
            <Download size={18} />
          </a>
          <button 
            className="icon-btn" 
            onClick={onClose} 
            title="Fechar (Esc)"
            style={{ color: '#fff', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
