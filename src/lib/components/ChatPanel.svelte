<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { socket } from '../socket';
  import { chatMessages } from '../stores/chat';
  import { sessionState } from '../stores/session';

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let message = '';
  let errorMessage = '';
  let messageList: HTMLElement;
  let previousMessageCount = 0;

  $: if (messageList && $chatMessages.length !== previousMessageCount) {
    previousMessageCount = $chatMessages.length;
    void scrollToLatestMessage();
  }

  function sendMessage(): void {
    const text = message.trim();

    if (!text) {
      return;
    }

    errorMessage = '';
    socket.emit('chat:send', text, (result: {
      ok: boolean;
      error?: string;
    }) => {
      if (!result.ok) {
        errorMessage = result.error ?? 'The message could not be sent.';
      }
    });
    message = '';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function scrollToLatestMessage(): Promise<void> {
    await tick();
    messageList.scrollTop = messageList.scrollHeight;
  }
</script>

<aside
  class="chat-panel"
  transition:fly={{ x: 32, duration: 220 }}
  aria-label="Player chat"
>
  <header class="chat-header">
    <div>
      <p class="chat-protocol">DEJAVU://PLAYER_LINK</p>
      <h2>Out-of-character chat</h2>
    </div>

    <button
      class="close-button"
      type="button"
      aria-label="Close chat"
      on:click={() => dispatch('close')}
    >
      ×
    </button>
  </header>

  <div class="message-list" bind:this={messageList} aria-live="polite">
    {#if $chatMessages.length === 0}
      <p class="empty-message">The private player link is quiet.</p>
    {/if}

    {#each $chatMessages as chatMessage (chatMessage.id)}
      <article
        class="message"
        class:own-message={chatMessage.playerId === $sessionState.playerId}
      >
        <div class="message-meta">
          <strong>{chatMessage.playerName}</strong>
          <time datetime={chatMessage.createdAt}>
            {new Date(chatMessage.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </time>
        </div>
        <p>{chatMessage.text}</p>
      </article>
    {/each}
  </div>

  <div class="chat-controls">
    <label for="player-chat-input">Message the other player</label>
    <div class="input-row">
      <textarea
        id="player-chat-input"
        bind:value={message}
        maxlength="500"
        rows="2"
        on:keydown={handleKeydown}
      ></textarea>
      <button type="button" disabled={!message.trim()} on:click={sendMessage}>
        Send
      </button>
    </div>

    {#if errorMessage}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}
  </div>
</aside>

<style lang="scss">
  .chat-panel {
    position: absolute;
    z-index: 30;
    right: 24px;
    bottom: 24px;
    width: min(430px, calc(100% - 48px));
    height: min(620px, calc(100% - 48px));
    overflow: hidden;
    color: #e8edf6;
    background: #070b16f2;
    border: 1px solid #ff75fd;
    border-radius: 6px;
    box-shadow:
      0 0 32px #ff75fd33,
      inset 0 0 28px #000000;
    backdrop-filter: blur(8px);

    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .chat-header {
    padding: 14px 16px;
    background: #171329;
    border-bottom: 1px solid #453b82;

    display: flex;
    justify-content: space-between;
    gap: 16px;

    h2 {
      margin: 3px 0 0;
      color: #e8edf6;
      font-size: 1rem;
    }
  }

  .chat-protocol {
    color: #ff75fd;
    font-family: "Orbitron", "Space Mono", sans-serif;
    font-size: 0.68rem;
    letter-spacing: 1px;
  }

  .close-button {
    width: 36px;
    height: 36px;
    color: #e8edf6;
    background: transparent;
    border: 1px solid #64748b;
    border-radius: 4px;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .message-list {
    padding: 16px;
    overflow-y: auto;
  }

  .message {
    margin: 0 28px 14px 0;
    padding: 10px 12px;
    background: #111a2c;
    border-left: 3px solid #4a98d9;
    border-radius: 3px;

    p {
      margin: 6px 0 0;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
  }

  .own-message {
    margin-right: 0;
    margin-left: 28px;
    border-right: 3px solid #ff75fd;
    border-left: 0;
  }

  .message-meta {
    color: #94a3b8;
    font-size: 0.72rem;

    display: flex;
    justify-content: space-between;
    gap: 12px;

    strong {
      color: #02fbfb;
    }
  }

  .empty-message {
    margin-top: 40px;
    color: #64748b;
    text-align: center;
  }

  .chat-controls {
    padding: 14px;
    background: #0c1322;
    border-top: 1px solid #334155;

    label {
      display: block;
      margin-bottom: 7px;
      color: #94a3b8;
      font-size: 0.72rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;

    textarea,
    button {
      padding: 10px;
      color: #e8edf6;
      background: #101a2d;
      border: 1px solid #4a98d9;
      border-radius: 4px;
      font: inherit;
    }

    textarea {
      resize: none;
    }

    button {
      cursor: pointer;
      font-weight: 700;

      &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
    }
  }

  .error-message {
    margin-top: 8px;
    color: #fb716d;
    font-size: 0.8rem;
  }

  @media (max-width: 640px) {
    .chat-panel {
      right: 10px;
      bottom: 10px;
      width: calc(100% - 20px);
      height: calc(100% - 20px);
    }
  }
</style>
