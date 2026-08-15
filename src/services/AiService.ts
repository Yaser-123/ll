import { initLlama } from 'llama.rn';
import type { LlamaContext } from 'llama.rn';
import { Platform } from 'react-native';

export interface AiMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  text: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: AiMessage[];
}

class AiService {
  private context: LlamaContext | null = null;
  private isInitializing = false;

  async initialize(modelPath: string) {
    if (this.context || this.isInitializing) return;
    this.isInitializing = true;
    try {
      this.context = await initLlama({
        model: modelPath,
        use_mlock: true, // Lock in RAM
        n_ctx: 1024, // Restricted to save memory on 4GB RAM devices
        n_gpu_layers: Platform.OS === 'ios' ? 100 : 0, // Metal on iOS, CPU on Android unless Mali is strictly supported
      });
      console.log('[AiService] LlamaContext initialized successfully.');
    } catch (error) {
      console.error('[AiService] Failed to initialize Llama:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  isReady() {
    return this.context !== null;
  }

  async release() {
    if (this.context) {
      await this.context.release();
      this.context = null;
      console.log('[AiService] LlamaContext released.');
    }
  }

  private buildPrompt(messages: AiMessage[]): string {
    // Qwen2.5 / ChatML format
    let prompt = '';
    for (const msg of messages) {
      prompt += `<|im_start|>${msg.role}\n${msg.text}<|im_end|>\n`;
    }
    prompt += `<|im_start|>assistant\n`;
    return prompt;
  }

  async generateResponse(
    messages: AiMessage[],
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.context) throw new Error('AiService not initialized');

    const prompt = this.buildPrompt(messages);
    
    return new Promise(async (resolve, reject) => {
      try {
        let fullResponse = '';
        await this.context!.completion(
          {
            prompt,
            n_predict: 256,
            temperature: 0.3, // Low temp for more accurate survival instructions
            stop: ['<|im_end|>', '<|im_start|>'],
          },
          (data) => {
            if (data.token) {
              fullResponse += data.token;
              onToken?.(data.token);
            }
          }
        );
        resolve(fullResponse.trim());
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const aiService = new AiService();
