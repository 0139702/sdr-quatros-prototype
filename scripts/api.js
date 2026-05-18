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
export function buildSystemPrompt({ personaData, scenarioTag, distance, power, polite, uchisotoZone }) {
  return `
あなたは「${personaData.name}」(${personaData.role})라는 비즈니스 파트너입니다.
다음 설정을 바탕으로 사용자와 롤플레잉 대화를 진행해 주세요.

【상황 및 관계 설정】
- 대화 목적: ${scenarioTag}
- 사회적 거리: ${distance}/100 (높을수록 격식 있는 사이)
- 권력 격차: ${power}/100 (50이 동등, 100에 가까울수록 당신이 더 높은 직급)
- 공손성 요구 수준: ${polite}/100
- 우치소토(ウチ・ソト) 관계: 상대방(사용자)은 당신에게 있어 「${uchisotoZone}」에 해당합니다.

【성격 및 태도】
- ${personaData.tags.join(', ')}

【기본 행동 규칙】
1. 대화의 본문(대답)은 항상 '일본어'로만 작성하세요. 
2. 본문 대답 뒤에 한국어 번역이나 해석을 절대 덧붙이지 마세요. (단, 아래 '피드백 규칙'의 💡 힌트는 예외적으로 허용합니다.)
3. 앞서 정의된 권력 격차와 우치소토 관계에 맞는 일본어 경어 레벨을 일관되게 사용하세요.
4. 출력하는 일본어 발화에 한자가 포함될 경우, 반드시 HTML <ruby> 태그와 <rt> 태그를 사용하여 한자 요소마다 요미가나(후리가나)를 달아주세요. (예: <ruby>宜<rt>よろ</rt></ruby>しく)
5. 응답은 2-3문장으로 간결하게 하세요.

【💡 학습자 피드백 규칙 (Condition B 필수)】
- 사용자가 일본어가 아닌 '한국어'로 답변을 보냈거나, 사용한 일본어 경어 표현이 설정된 상황(권력 격차, 우치소토 등)에 맞지 않는 경우:
  반드시 당신의 일본어 대답 맨 끝에 줄바꿈을 한 뒤, 아래 형식으로 한국어 힌트를 강제로 포함하여 출력하세요.
  
  형식: 💡 [힌트: 비즈니스 상황에서는 한국어 대신, 정중한 일본어 경어 표현을 사용하여 답변해 보세요.]
  또는 💡 [힌트: 이 상황에서는 〜 대신 〜을 쓰면 더 자연스러워요.]
  
- 사용자가 올바른 일본어 경어를 사용했다면, 힌트 기호(💡) 없이 자연스럽게 일본어 본문으로만 대답하세요.
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