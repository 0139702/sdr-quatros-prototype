// api.js
// 프론트엔드에서 Netlify Functions를 호출하는 모듈
// API 키는 절대 여기에 없음 — 서버(chat.js, log.js)에만 있음

// 설정
// 개발 중엔 로컬 서버, 배포 후엔 자동으로 /api/* 경로 사용
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8888/api'
  : '/api';

// 현재 사용 모델: 'gemini' (개발) | 'openai' (최종 실험)
// 화면 3에서 토글로 바꿀 수 있게 export
export let currentModel = 'gemini';
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

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `서버 오류 (${res.status})`);
  }

  const data = await res.json();
  return data.reply;
}

// 2. 실험 로깅
/**
 * 세션 시작 — 슬라이더/우치소토 설정 저장
 * @returns {Promise<string>} sessionId
 */
export async function createSession(params) {
  const res = await fetch(`${API_BASE}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'create_session', data: params }),
  });

  if (!res.ok) throw new Error('세션 생성 실패');
  const result = await res.json();
  return result.data?.[0]?.id; // Supabase가 반환한 session id
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

// 3. 시스템 프롬프트 생성기
/**
 * 슬라이더 값 + 우치소토 위치를 받아서 일본어 경어 시스템 프롬프트 생성
 */
export function buildSystemPrompt({ condition, sliderDistance, sliderPower, sliderPolite, uchisotoZone }) {
  const distanceLabel = sliderDistance > 66 ? '격식적(소토)' : sliderDistance > 33 ? '보통' : '친근(우치)';
  const powerLabel    = sliderPower > 74 ? '상대방이 훨씬 높음' : sliderPower > 50 ? '상대방이 약간 높음' : '동등함';
  const politeLabel   = sliderPolite > 89 ? '겸양어+존경어 필수' : sliderPolite > 66 ? '정중어 위주' : '보통체 허용';

  const basePrompt = `
あなたは橋本陸（はしもとりく）というビジネスパーソンです。
以下の設定で会話してください。

【상황 설정】
- 사회적 거리: ${distanceLabel} (우치소토: ${uchisotoZone})
- 권력 관계: ${powerLabel}
- 요구 경어 레벨: ${politeLabel}

【행동 규칙】
1. 항상 일본어로 대답하세요
2. 경어 레벨에 맞는 표현을 일관되게 사용하세요
3. 소토 관계일 때는 손양어(謙譲語)와 존경어(尊敬語)를 적절히 사용하세요
4. 거절 시 완곡한 표현을 선호하세요 (예: 〜は難しい状況でございます)
5. 응답은 2-3문장으로 간결하게 하세요
6. 자연스러운 비즈니스 일본어 대화를 유지하세요
`.trim();

  // Condition A: 직접 대화만
  if (condition === 'A') {
    return basePrompt;
  }

  // Condition B: 사용자 발화에 대해 경어 피드백 포함
  return basePrompt + `

【Condition B 추가 규칙】
사용자가 일본어로 말하면:
1. 먼저 자연스럽게 대화를 이어가세요
2. 사용자의 경어 표현이 상황에 맞지 않으면 대화 끝에 한국어로 간단히 힌트를 주세요
   형식: 💡 [힌트: 이 상황에서는 〜 대신 〜을 쓰면 더 자연스러워요]
3. 경어가 적절하면 칭찬하지 말고 그냥 대화를 이어가세요 (학습자가 의식하지 않도록)
`;
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