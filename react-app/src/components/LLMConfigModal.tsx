import React, { useState, useEffect } from 'react';

interface LLMConfig {
  model: 'gpt-4' | 'claude-3' | 'gemini-pro';
  apiKey?: string;
  provider: 'openai' | 'anthropic' | 'google';
}

interface LLMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSave: (config: LLMConfig) => void;
}

const LLM_MODELS = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai' as const,
    description: 'OpenAI의 최신 모델, 높은 정확도와 맥락 이해력'
  },
  {
    id: 'claude-3',
    name: 'Claude-3',
    provider: 'anthropic' as const,
    description: 'Anthropic의 안전하고 정확한 모델'
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'google' as const,
    description: 'Google의 다목적 AI 모델'
  }
];

// 환경변수에서 API 키 가져오기
const getApiKeyFromEnv = (provider: string): string | undefined => {
  // React 앱에서 환경변수 접근 방식
  const getEnvVar = (key: string): string | undefined => {
    // @ts-ignore - React 환경변수 접근
    return window._env_?.[key] || process.env[key];
  };

  switch (provider) {
    case 'openai':
      return getEnvVar('REACT_APP_OPENAI_API_KEY') || 
             getEnvVar('VITE_OPENAI_API_KEY');
    case 'anthropic':
      return getEnvVar('REACT_APP_ANTHROPIC_API_KEY') || 
             getEnvVar('VITE_ANTHROPIC_API_KEY');
    case 'google':
      return getEnvVar('REACT_APP_GOOGLE_API_KEY') || 
             getEnvVar('VITE_GOOGLE_API_KEY');
    default:
      return undefined;
  }
};

export default function LLMConfigModal({ isOpen, onClose, onConfigSave }: LLMConfigModalProps) {
  const [selectedModel, setSelectedModel] = useState<LLMConfig['model']>('gpt-4');

  useEffect(() => {
    if (isOpen) {
      // 로컬 스토리지에서 기존 설정 불러오기
      const savedConfig = localStorage.getItem('llm-config');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        setSelectedModel(config.model);
      }
    }
  }, [isOpen]);

  const handleSave = async () => {
    // 환경변수에서 API 키 확인
    const envApiKey = getApiKeyFromEnv(selectedModel);
    
    if (!envApiKey) {
      alert('환경변수에 API 키가 설정되지 않았습니다.\n\n.env 파일에 다음을 추가하세요:\nREACT_APP_OPENAI_API_KEY=your_api_key_here');
      return;
    }

    const config: LLMConfig = {
      model: selectedModel,
      provider: LLM_MODELS.find(m => m.id === selectedModel)!.provider
    };
    
    // 로컬 스토리지에 저장
    localStorage.setItem('llm-config', JSON.stringify(config));
    onConfigSave(config);
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md">
        <h3 className="text-lg font-semibold mb-4">AI 모델 설정</h3>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            AI 모델 선택
          </label>
          <div className="space-y-2">
            {LLM_MODELS.map((model) => {
              const hasApiKey = getApiKeyFromEnv(model.provider);
              return (
                <label key={model.id} className={`flex items-center space-x-3 cursor-pointer ${!hasApiKey ? 'opacity-50' : ''}`}>
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={(e) => setSelectedModel(e.target.value as LLMConfig['model'])}
                    disabled={!hasApiKey}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">{model.name}</div>
                    <div className="text-xs text-gray-500">{model.description}</div>
                    {!hasApiKey && (
                      <div className="text-xs text-red-500">API 키 필요</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {getApiKeyFromEnv(selectedModel) ? (
          <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg mb-6">
            <p className="text-sm text-green-700">
              ✅ 환경변수에서 API 키를 사용합니다
            </p>
            <p className="text-xs text-green-600 mt-1">
              {getApiKeyFromEnv(selectedModel)?.substring(0, 10)}...
            </p>
          </div>
        ) : (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-6">
            <p className="text-sm text-red-700">
              ❌ API 키가 설정되지 않았습니다
            </p>
            <p className="text-xs text-red-600 mt-1">
              .env 파일에 REACT_APP_OPENAI_API_KEY를 설정하세요
            </p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!getApiKeyFromEnv(selectedModel)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
} 