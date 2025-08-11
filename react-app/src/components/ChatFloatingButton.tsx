import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface ChatFloatingButtonProps {
  onClick: () => void;
}

export default function ChatFloatingButton({ onClick }: ChatFloatingButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-3xl z-40 group"
      aria-label="접근성 분석 채팅 시작"
    >
      <div className="relative">
        <MessageSquare className="w-6 h-6 transition-transform group-hover:scale-110" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-pink-400 to-rose-400 rounded-full animate-pulse"></div>
      </div>
      
      {/* 호버 시 툴팁 */}
      <div className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap">
          AI와 접근성 분석하기
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-4 border-l-gray-900 border-t-2 border-t-transparent border-b-2 border-b-transparent"></div>
        </div>
      </div>
    </button>
  );
} 