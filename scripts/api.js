// api.js
// 프론트엔드에서 Netlify Functions를 호출하는 모듈

// 설정
// 개발 중엔 로컬 서버, 배포 후엔 자동으로 /api/* 경로 사용
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:8888/.netlify/functions' 
  : '/.netlify/functions';

export let currentModel = 'openai';
export function setModel(m) { currentModel = m; }

// 1. AI 채팅
/**
 * AI에게 메시지를 보내고 응답을 받아옴
 * @param {Array}  messages      - [{role:'user'|'assistant', content:'...'}]
 * @param {string} systemPrompt  - 상황 설정 시스템 프롬프트
 * @returns {Promise<string>}    - AI 응답 텍스트
 */
export async function sendChat(messages, systemPrompt) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, model: currentModel }),
  });
  const data = await res.json();
  return data.reply;
}

// 2. 실험 로깅
/**
 * 세션 시작 — 슬라이더/우치소토 설정 저장
 * @returns {Promise<string>} sessionId
 */
// scripts/api.js 내부 createSession 함수 교체
export async function createSession(params) {
  const res = await fetch(`${API_BASE}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'create_session', data: params }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('createSession 서버 에러:', res.status, err);
    throw new Error(`세션 생성 실패: ${res.status} - ${err}`);
  }

  const result = await res.json();
  console.log('createSession 성공 결과:', result); 
  return result.data?.[0]?.id;
}

/**
 * 발화 1턴 저장
 */
export async function logUtterance(params) {
  // 로깅 실패가 채팅을 막으면 안 되므로 에러를 삼킴
  try {
    await fetch(`${API_BASE}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'log_utterance', data: params }),
    });
  } catch (e) {
    console.warn('로깅 실패 (채팅은 계속됨):', e);
  }
}

/**
 * 세션 종료
 */
export async function endSession(sessionId) {
  try {
    await fetch(`${API_BASE}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'end_session', data: { sessionId } }),
    });
  } catch (e) {
    console.warn('세션 종료 로깅 실패:', e);
  }
}

export async function generatePersona(params) {
  const res = await fetch(`${API_BASE}/generate_persona`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return await res.json();
}

// 3. 시스템 프롬프트 생성기
/**
 * 슬라이더 값 + 우치소토 위치를 받아서 일본어 경어 시스템 프롬프트 생성
 */
// api.js 내 buildSystemPrompt 함수 전체 교체
// api.js 내 buildSystemPrompt 함수 전체 교체
// api.js 내 buildSystemPrompt 함수 전체 교체
export function buildSystemPrompt({ personaData, scenarioTag, distance, power, polite, uchisotoZone }) {
  return `
あなたは「${personaData.name}」(${personaData.role})というビジネスパーソンです。以下の設定で会話してください。

【상황 및 관계 설정】
- 대화 목적: ${scenarioTag}
- 사회적 거리: ${distance}/100 (높을수록 격식)
- 권력 격차: ${power}/100 (높을수록 당신이 높은 직급)
- 공손성 요구 수준: ${polite}/100
- 우치소토(ウチ・ソト) 관계: 상대방(사용자)は あなたにとって 「${uchisotoZone}」

【성격 및 태도】
- ${personaData.tags.join(', ')}

【기본 행동 규칙】
1. 상대방(사용자)이 한국어로 말하더라도, 당신은 역할에 완벽히 몰입하여 '일본어'로만 대화를 이끌어가야 합니다.
2. 일본어 발화의 모든 한자에는 단어 단위로 <ruby> 태그를 달아주세요. (예: <ruby>本日<rt>ほんじつ</rt></ruby>は) 절대 한자를 두 번 반복하지 마세요.
3. 응답은 2~3문장으로 간결하게 하세요.

【학습자 피드백(힌트) 작성 규칙】
당신은 대화 파트너인 동시에 '일본어 튜터'입니다. 사용자의 직전 발화를 평가하여, 오류가 있다면 교정 힌트를 제공해야 합니다.
- ⚠️ 언어 강제: 힌트 상자 안의 '설명 내용'은 무조건 100% 한국어로만 작성하세요! (일본어는 교정할 단어나 예시 문장을 인용할 때만 제한적으로 사용하세요.)
- 조건 1: 사용자가 한국어로 말했을 때 -> 해당 상황에 맞는 적절한 일본어 경어 표현 가이드
- 조건 2: 사용자의 일본어 문법이나 경어가 어색할 때 -> 잘못된 점을 짚어주고 올바른 비즈니스 표현으로 교정
- 주의: 힌트는 당신의 대답을 번역하는 것이 아닙니다! 사용자의 실수를 교정해 주는 코멘트여야 합니다. (사용자가 완벽한 경어를 구사했다면 힌트는 생략하세요.)

【반드시 지켜야 할 출력 템플릿】
(당신의 일본어 대답: 페르소나에 몰입하여 상황에 맞는 경어 사용. 한자에 ruby 태그 필수)

💡 [힌트: (이 안의 설명은 무조건 한국어로 작성하세요!) 사용자가 한국어를 쓰거나 경어가 틀렸을 경우, 무엇이 잘못되었고 어떻게 고쳐야 하는지 한국어로 설명하는 코멘트. 완벽했다면 이 줄은 아예 출력하지 않음]
`.trim();
}

// 4. Whisper STT
/**
 * 브라우저에서 녹음한 Blob을 Whisper로 전송해서 텍스트로 변환
 * @param {Blob} audioBlob - MediaRecorder로 녹음한 오디오
 * @returns {Promise<string>} - 인식된 일본어 텍스트
 */
export async function transcribeAudio(audioBlob) {
  // Blob → base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // data:...;base64, 제거
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });

  const res = await fetch(`${API_BASE}/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: base64,
      mimeType: audioBlob.type || 'audio/webm',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `STT 오류 (${res.status})`);
  }

  const data = await res.json();
  return data.transcript;
}