const fs = require('fs');
const path = require('path');

// dotenv를 사용해서 .env 파일 로드
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 환경변수 파일 경로
const envConfigPath = path.join(__dirname, '../public/env-config.js');

// 환경변수 목록
const envVars = [
  'REACT_APP_OPENAI_API_KEY',
  'REACT_APP_ANTHROPIC_API_KEY', 
  'REACT_APP_GOOGLE_API_KEY'
];

// 환경변수 객체 생성
const envConfig = {};
envVars.forEach(key => {
  envConfig[key] = process.env[key] || '';
});

// env-config.js 파일 내용 생성
const envConfigContent = `// 환경변수 설정 - 빌드 시점에 자동으로 주입됨
window._env_ = ${JSON.stringify(envConfig, null, 2)};
`;

// 파일 작성
fs.writeFileSync(envConfigPath, envConfigContent);

console.log('✅ 환경변수가 env-config.js에 주입되었습니다.');
console.log('주입된 환경변수:', Object.keys(envConfig).filter(key => envConfig[key]));
console.log('환경변수 값 확인:', {
  OPENAI: envConfig.REACT_APP_OPENAI_API_KEY ? '설정됨' : '설정되지 않음',
  ANTHROPIC: envConfig.REACT_APP_ANTHROPIC_API_KEY ? '설정됨' : '설정되지 않음',
  GOOGLE: envConfig.REACT_APP_GOOGLE_API_KEY ? '설정됨' : '설정되지 않음'
}); 