// netlify/functions/log.js
// 실험 데이터를 Supabase에 저장하는 함수
// API 키가 서버에만 존재

exports.handler = async (event) => {
  const allowedOrigins = [
    'https://sdr-learnlanguage.netlify.app',
    'http://localhost:8888',
  ];

  const origin = event.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (서버 전용)
    const payload = JSON.parse(event.body);
    const { type, data } = payload;
    let endpoint = '';
    let insertData = {};

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase 환경변수가 설정되지 않았습니다');
    }

    // 세션 생성
    if (type === 'create_session') {
      endpoint = '/rest/v1/sessions';
      insertData = {
        participant_id: data.participantId,         // 예: "P01"
        experiment_day: data.experimentDay,             // 예: "2024-06-01"
        condition: 'B',                   // 'A' | 'B'
        learning_type: data.learningType,            // 'speaking' 등
        slider_distance: data.sliderDistance,
        slider_power: data.sliderPower,
        slider_polite: data.sliderPolite,
        uchisoto_x: data.uchisotoX,
        uchisoto_y: data.uchisotoY,
        ai_model: data.aiModel,                     // 'gemini' | 'openai'
        started_at: new Date().toISOString(),
      };
    }

    // 발화 로그 저장
    else if (type === 'log_utterance') {
      endpoint = '/rest/v1/utterances';
      insertData = {
        session_id: data.sessionId,
        turn_number: data.turnNumber,
        user_input: data.userInput,
        input_method: data.inputMethod,             // 'stt' | 'text'
        ai_response: data.aiResponse,
        response_time_ms: data.responseTimeMs,
        step_option_chosen: data.stepOptionChosen,  // Condition B 선택지 (없으면 null)
        feedback_level: data.feedbackLevel,         // 'correct'|'partial'|'wrong'|null
        created_at: new Date().toISOString(),
      };
    }

    // 세션 종료 시간 업데이트
    else if (type === 'end_session') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?id=eq.${data.sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ ended_at: new Date().toISOString() }),
      });
      return {
        statusCode: res.ok ? 200 : 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: res.ok }),
      };
    }

    else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '알 수 없는 type' }) };
    }

    // Supabase INSERT
    const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation', // 생성된 row 반환
      },
      body: JSON.stringify(insertData),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase 오류: ${res.status} — ${err}`);
    }

    const result = await res.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, data: result }),
    };

  } catch (err) {
    console.error('log function error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};