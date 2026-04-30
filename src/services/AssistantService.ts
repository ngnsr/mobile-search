import { ENV } from '../config/env';
import EventSource from 'react-native-sse';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class AssistantService {
  async chat(params: { model: string; messages: ChatMessage[]; temperature?: number; onChunk?: (text: string) => void }): Promise<string> {
    if (!params.onChunk) {
      const res = await fetch(`${ENV.API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.0,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Chat request failed: HTTP ${res.status} ${text}`);
      }

      const json: any = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Response missing content');
      return content;
    }

    return new Promise((resolve, reject) => {
      let fullText = '';
      
      const es = new EventSource(`${ENV.API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.0,
          stream: true,
        }),
      });

      es.addEventListener('message', (event: any) => {
        if (event.data === '[DONE]') {
          es.close();
          resolve(fullText);
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          const chunk = parsed.choices[0]?.delta?.content || '';
          if (chunk) {
            fullText += chunk;
            params.onChunk?.(chunk);
          }
        } catch (e) {
          console.error("Failed to parse SSE chunk", e);
        }
      });

      es.addEventListener('error', (event: any) => {
        const errType = event.type;
        const msg = event.message || 'Stream error';
        es.close();
        // EventSource will trigger 'error' eventually if connection dies
        if (fullText) {
           // We already have some response, consider it done instead of crashing
           resolve(fullText);
        } else {
           reject(new Error(msg));
        }
      });
    });
  }
}
