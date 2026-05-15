// netlify/functions/chat.js

exports.handler = async (event) => {
  // CORS: Netlify 도메인만 허용 (배포 후 실제 도메인으로 교체)
  const allowedOrigins = [
    'https://sdr-learnlanguage.netlify.app',
    'http://localhost:8888',          // for local testing
  ];

  const origin = event.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  try {
    const { messages, systemPrompt, model = 'openai' } = JSON.parse(event.body);

    // 기본 입력 검증
    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'messages 필드가 필요합니다' }) };
    }
    if (messages.length > 50) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '대화가 너무 깁니다' }) };
    }

    let reply = '';

    // Gemini 2.5 Flash
    // if (model === 'gemini') {
    //   const GEMINI_KEY = process.env.GEMINI_API_KEY;
    //   if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다');

    //   // Gemini는 messages 형식이 다름: role이 'user'/'model'
    //   const geminiMessages = messages.map(m => ({
    //     role: m.role === 'assistant' ? 'model' : 'user',
    //     parts: [{ text: m.content }],
    //   }));

    //   const geminiBody = {
    //     system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    //     contents: geminiMessages,
    //     generationConfig: {
    //       maxOutputTokens: 500,
    //       temperature: 0.7,
    //     },
    //   };

    //   const res = await fetch(
    //     `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_KEY}`,
    //     {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify(geminiBody),
    //     }
    //   );

    //   if (!res.ok) {
    //     const err = await res.text();
    //     throw new Error(`Gemini API 오류: ${res.status} — ${err}`);
    //   }

    //   const data = await res.json();
    //   reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 받지 못했습니다.';
    // }

    // GPT-4.1 Mini
    if (model === 'openai') {
      const OPENAI_KEY = process.env.OPENAI_STT_KEY;
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다');

      const openaiMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: openaiMessages,
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API 오류: ${res.status} — ${err}`);
      }

      const data = await res.json();
      reply = data.choices?.[0]?.message?.content || '응답을 받지 못했습니다.';
    }

    else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: '지원하지 않는 모델입니다' }) };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };

  } catch (err) {
    console.error('chat function error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || '서버 오류가 발생했습니다' }),
    };
  }
};