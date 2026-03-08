/* =============================================
   Chat Bubble - 对话气泡组件
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { m3Shared, m3Scrollbar } from '../styles/shared';

interface ChatMessage {
  id: string;
  role: 'user' | 'pet';
  content: string;
  timestamp: number;
}

@customElement('chat-bubble')
export class ChatBubble extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* Messages area */
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      /* M3 Expressive scrollbar */
      .messages::-webkit-scrollbar {
        width: 6px;
      }
      .messages::-webkit-scrollbar-track {
        background: transparent;
        margin: 4px 0;
      }
      .messages::-webkit-scrollbar-thumb {
        background: var(--md-sys-color-on-surface-variant, #c3c8bb);
        border-radius: 100px;
        opacity: 0.5;
      }
      .messages::-webkit-scrollbar-thumb:hover {
        background: var(--md-sys-color-on-surface, #e2e3da);
      }
      .messages::-webkit-scrollbar-corner {
        background: transparent;
      }

      .message {
        display: flex;
        flex-direction: column;
        max-width: 80%;
        animation: msgIn var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
      }
      @keyframes msgIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .message.user {
        align-self: flex-end;
      }
      .message.pet {
        align-self: flex-start;
      }

      .bubble {
        padding: 10px 16px;
        font-size: 14px;
        line-height: 20px;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .message.user .bubble {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        border-radius: 18px 18px 4px 18px;
      }
      .message.pet .bubble {
        background: var(--md-sys-color-surface-container-high);
        color: var(--md-sys-color-on-surface);
        border-radius: 18px 18px 18px 4px;
      }

      .msg-time {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        margin-top: 4px;
        padding: 0 4px;
      }
      .message.user .msg-time {
        text-align: right;
      }

      /* Typing indicator */
      .typing {
        align-self: flex-start;
        display: flex;
        gap: 4px;
        padding: 12px 16px;
        background: var(--md-sys-color-surface-container-high);
        border-radius: 18px 18px 18px 4px;
      }
      .typing-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--md-sys-color-on-surface-variant);
        animation: bounce 1.4s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }

      /* Input area */
      .input-area {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--md-sys-color-outline-variant);
        background: var(--md-sys-color-surface-container-low);
        flex-shrink: 0;
      }
      .input-area textarea {
        flex: 1;
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        line-height: 20px;
        padding: 10px 14px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-large);
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        outline: none;
        resize: none;
        max-height: 120px;
        min-height: 40px;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .input-area textarea:focus {
        border-color: var(--md-sys-color-primary);
      }
      .send-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        cursor: pointer;
        flex-shrink: 0;
        align-self: flex-end;
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard),
                    transform 100ms ease;
      }
      .send-btn:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
      .send-btn:active {
        transform: scale(0.92);
      }
      .send-btn:disabled {
        background: var(--md-sys-color-surface-container-highest);
        color: var(--md-sys-color-on-surface-variant);
        cursor: not-allowed;
      }

      /* Welcome */
      .welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 12px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
        padding: 32px;
      }
      .welcome .material-symbols-outlined {
        font-size: 56px;
        color: var(--md-sys-color-primary);
        animation: wave 2s ease-in-out infinite;
      }
      @keyframes wave {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(14deg); }
        75% { transform: rotate(-14deg); }
      }
    `,
  ];

  private static readonly STORAGE_KEY = 'chat-messages';
  private static readonly MAX_MESSAGES = 200;

  @state() private _messages: ChatMessage[] = [];
  @state() private _inputText = '';
  @state() private _sending = false;

  @query('.messages') private _messagesEl!: HTMLElement;

  override connectedCallback() {
    super.connectedCallback();
    // Restore chat history from localStorage
    try {
      const saved = localStorage.getItem(ChatBubble.STORAGE_KEY);
      if (saved) {
        this._messages = JSON.parse(saved) as ChatMessage[];
      }
    } catch { /* ignore corrupt data */ }
  }

  private _persistMessages() {
    // Keep only the latest N messages to avoid unbounded growth
    const toSave = this._messages.slice(-ChatBubble.MAX_MESSAGES);
    try {
      localStorage.setItem(ChatBubble.STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* storage full, ignore */ }
  }

  private _scrollToBottom() {
    requestAnimationFrame(() => {
      if (this._messagesEl) {
        this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
      }
    });
  }

  private async _sendMessage() {
    const text = this._inputText.trim();
    if (!text || this._sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this._messages = [...this._messages, userMsg];
    this._inputText = '';
    this._sending = true;
    this._persistMessages();
    this._scrollToBottom();

    try {
      // POST to a chat endpoint (if the backend router exposes one),
      // otherwise simulate a response for now.
      const res = await fetch('/api/pet-scheduler/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      let reply: string;
      let actions: Array<{type?: string; message?: string}> = [];
      if (res.ok) {
        const data = await res.json();
        reply = data.data?.reply ?? data.reply ?? '嗯……我不知道该说什么。';
        actions = data.data?.actions ?? data.actions ?? [];
      } else {
        reply = '哎呀，出了点问题，请再试一次。';
      }

      // 如果有执行操作，在回复前显示操作通知
      if (actions.length > 0) {
        const actionText = actions
          .map((a) => `✅ ${a.message || '操作已完成'}`)
          .join('\n');
        const actionMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'pet',
          content: actionText,
          timestamp: Date.now(),
        };
        this._messages = [...this._messages, actionMsg];

        // 通知其他组件刷新数据
        this.dispatchEvent(
          new CustomEvent('data-changed', {
            bubbles: true,
            composed: true,
            detail: { types: actions.map((a) => a.type) },
          }),
        );
      }

      const petMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'pet',
        content: reply,
        timestamp: Date.now(),
      };
      this._messages = [...this._messages, petMsg];
      this._persistMessages();
    } catch {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'pet',
        content: '暂时无法连接服务器。',
        timestamp: Date.now(),
      };
      this._messages = [...this._messages, errMsg];
      this._persistMessages();
    } finally {
      this._sending = false;
      this._scrollToBottom();
    }
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  private _formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  override render() {
    return html`
      <div class="messages">
        ${this._messages.length === 0
          ? html`
            <div class="welcome">
              <span class="material-symbols-outlined">waving_hand</span>
              <span class="title-medium">你好呀！</span>
              <span class="body-medium">
                和你的桌宠聊天吧~<br/>
                你可以问问日程、待办，或者随便聊聊。
              </span>
            </div>`
          : this._messages.map(m => html`
            <div class="message ${m.role}">
              <div class="bubble">${m.content}</div>
              <span class="msg-time">${this._formatTime(m.timestamp)}</span>
            </div>
          `)
        }
        ${this._sending
          ? html`
            <div class="typing">
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
            </div>`
          : nothing}
      </div>
      <div class="input-area">
        <textarea rows="1" placeholder="说点什么..."
          .value=${this._inputText}
          @input=${(e: Event) => (this._inputText = (e.target as HTMLTextAreaElement).value)}
          @keydown=${this._handleKeydown}></textarea>
        <button class="send-btn" ?disabled=${this._sending || !this._inputText.trim()}
          @click=${this._sendMessage}>
          <span class="material-symbols-outlined" style="font-size:20px">send</span>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-bubble': ChatBubble;
  }
}
