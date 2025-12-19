import React from 'react';
import { createPortal } from 'react-dom';

interface DeleteConfirmModalProps {
  title?: string;
  message?: string;
  itemName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ 
  title = '确认删除',
  message,
  itemName,
  onConfirm, 
  onCancel 
}) => {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in" />
      <div 
        className="relative w-full max-w-sm bg-cyber-dark rounded-2xl border border-white/10 p-5 animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </div>

        <h2 className="text-lg font-bold text-white text-center mb-2">{title}</h2>
        <p className="text-gray-400 text-center text-sm mb-6">
          {message || (
            <>
              {itemName ? (
                <>确定要删除 "<span className="text-white">{itemName}</span>" 吗？<br/></>
              ) : null}
              此操作无法撤销。
            </>
          )}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors btn-press"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors btn-press"
          >
            删除
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeleteConfirmModal;