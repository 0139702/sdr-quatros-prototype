// netlify/functions/generate_persona.js
exports.handler = async (event) => {
  const allowedOrigins = ['https://sdr-learnlanguage.netlify.app', 'http://localhost:8888'];
  const origin = event.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  try {
    const { scenarioTag, distance, power, polite, uchisoto } = JSON.parse(event.body);
    const OPENAI_KEY = process.env.OPENAI_STT_KEY; // 기존 키 재사용

    const systemPrompt = `
      당신은 일본어 비즈니스 회화 상황 생성기입니다. 사용자가 입력한 설정값을 바탕으로, 사용자가 대화할 **상대방(파트너)**의 페르소나를 만들어주세요.
      - 대화 목적 및 상황: ${scenarioTag}
      - 사회적 거리: ${distance}/100 (높을수록 격식)
      - 권력 격차 (상대방 기준): ${power}/100 (높을수록 상대가 나보다 높은 직급)
      - 공손성 요구 수준: ${polite}/100
      - 우치소토 위치 (상대방의 위치): ${uchisoto}
      
      반드시 아래 JSON 형식으로만 응답하세요:
      {
        "name": "상대방 이름 (예: 타나카 부장 - 입력된 이름이 있다면 그대로 사용)",
        "role": "상대방의 직급 및 나와의 관계 (예: 타사 영업부장, 직속 상사 등)",
        "speech_jp": "상대방의 첫인사나 대화 시작 발화 (일본어). 한자가 포함될 경우 반드시 <ruby>한자<rt>요미가나</rt></ruby> 태그를 적용하세요.",
        "speech_ko": "첫인사 한국어 해석",
        "tags": ["엄격함", "존경어 선호", "결과 중심적"]
      }
    `;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' }
      }),
    });

    const data = await res.json();
    const persona = JSON.parse(data.choices[0].message.content);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(persona) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};