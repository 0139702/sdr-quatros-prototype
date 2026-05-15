// netlify/functions/stt.js
// OpenAI Whisper API로 음성 → 텍스트 변환
// 브라우저에서 녹음한 audio blob을 받아서 일본어 텍스트로 변환

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
    const OPENAI_KEY = process.env.OPENAI_STT_KEY;

    console.log('OPENAI_KEY debug:', {
    exists: !!OPENAI_KEY,
    prefix: OPENAI_KEY?.slice(0, 8),
    suffix: OPENAI_KEY?.slice(-4),
    length: OPENAI_KEY?.length,
    hasSpace: /\s/.test(OPENAI_KEY || ''),
    });
    
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다');

    // 브라우저에서 base64로 인코딩된 오디오 데이터를 받음
    const { audioBase64, mimeType = 'audio/webm' } = JSON.parse(event.body);
    if (!audioBase64) throw new Error('audioBase64 필드가 필요합니다');

    // base64 → Buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Whisper API는 multipart/form-data 형식 필요
    // Node.js 내장 방식으로 FormData 구성
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const filename = 'audio.webm';

    // multipart body 수동 구성 (Node 18에서 FormData가 불안정할 수 있어서)
    const parts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
    ];
    const partsBuffer = Buffer.from(parts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `ja\r\n` +  // 일본어 고정 (인식률 향상)
      `--${boundary}--\r\n`
    );

    const body = Buffer.concat([partsBuffer, audioBuffer, footer]);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper API 오류: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const transcript = (data.text || '').trim();

    const hallucinatedPhrases = [
        '視聴してくださって本当にありがとうございます。',
        '視聴してくださって 本当にありがとうございます。',
        'ご視聴ありがとうございました。',
        'ありがとうございました。',
    ];

    if (!transcript || hallucinatedPhrases.includes(transcript)) {
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: '' }),
        }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    };

  } catch (err) {
    console.error('stt function error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};