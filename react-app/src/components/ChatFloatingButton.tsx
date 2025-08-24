import React from 'react';

interface ChatFloatingButtonProps {
  onClick: () => void;
  hasUnreadMessages?: boolean;
}

export default function ChatFloatingButton({ onClick, hasUnreadMessages = false }: ChatFloatingButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group z-40"
      title="AI 접근성 분석과 대화하기"
    >
      <div className="text-xl">💬</div>
      {hasUnreadMessages && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
      )}
      <div className="absolute right-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        AI와 대화하기
      </div>
    </button>
  );
} 