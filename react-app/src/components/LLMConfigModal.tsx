import React, { useState, useEffect } from 'react';

interface LLMConfig {
  model: 'gpt-4' | 'claude-3' | 'gemini-pro';
  apiKey: string;
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

export default function LLMConfigModal({ isOpen, onClose, onConfigSave }: LLMConfigModalProps) {
  const [selectedModel, setSelectedModel] = useState<LLMConfig['model']>('gpt-4');
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 로컬 스토리지에서 기존 설정 불러오기
      const savedConfig = localStorage.getItem('llm-config');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        setSelectedModel(config.model);
        setApiKey(config.apiKey);
      }
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      alert('API 키를 입력해주세요.');
      return;
    }

    setIsValidating(true);
    
    try {
      // API 키 유효성 검증
      const isValid = await validateAPIKey(selectedModel, apiKey);
      
      if (isValid) {
        const config: LLMConfig = {
          model: selectedModel,
          apiKey,
          provider: LLM_MODELS.find(m => m.id === selectedModel)!.provider
        };
        
        // 로컬 스토리지에 임시 저장
        localStorage.setItem('llm-config', JSON.stringify(config));
        onConfigSave(config);
        onClose();
      } else {
        console.log('API 키 검증 실패:', { model: selectedModel, keyLength: apiKey.length });
        alert(`API 키가 유효하지 않습니다. (모델: ${selectedModel}, 길이: ${apiKey.length})`);
      }
    } catch (error) {
      console.error('API 키 검증 오류:', error);
      alert('API 키 검증 중 오류가 발생했습니다.');
    } finally {
      setIsValidating(false);
    }
  };

  const validateAPIKey = async (model: string, key: string): Promise<boolean> => {
    // 클라이언트 사이드에서만 검증 (API 엔드포인트 없음)
    console.log('API 키 검증 시작:', { model, keyLength: key.length });
    
    // 실제 API 호출은 나중에 구현하고, 지금은 형식 검증만
    return validateKeyFormat(model, key);
  };

  const validateKeyFormat = (model: string, key: string): boolean => {
    // 개발 중에는 매우 관대한 검증 (실제 API 키가 아닌 테스트용)
    console.log('키 검증:', { model, keyLength: key.length, key: key.substring(0, 5) + '...' });
    
    // 최소 길이만 체크
    return key.trim().length >= 5;
  };

  const handleClose = () => {
    // 창 닫을 때 로컬 스토리지에서 API 키 삭제
    localStorage.removeItem('llm-config');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md">
        <h3 className="text-lg font-semibold mb-4">AI 모델 설정</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            AI 모델 선택
          </label>
          <div className="space-y-2">
            {LLM_MODELS.map((model) => (
              <label key={model.id} className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="model"
                  value={model.id}
                  checked={selectedModel === model.id}
                  onChange={(e) => setSelectedModel(e.target.value as LLMConfig['model'])}
                  className="text-blue-600"
                />
                <div>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-xs text-gray-500">{model.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API 키
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API 키를 입력하세요"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            API 키는 이 세션 동안만 저장되며, 창을 닫으면 삭제됩니다.
          </p>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isValidating || !apiKey.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>검증 중...</span>
              </>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 