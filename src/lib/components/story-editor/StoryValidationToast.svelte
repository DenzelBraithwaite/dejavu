<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryValidationIssue } from './types';

  export let statusMessage = '';
  export let errorMessage = '';
  export let issues: StoryValidationIssue[] = [];
  export let detailsOpen = false;

  const dispatch = createEventDispatcher<{
    close: void;
    focusIssue: { issue: StoryValidationIssue };
    toggleDetails: void;
  }>();
</script>

{#if statusMessage || errorMessage}
  <div
    class="toast-message"
    class:error={Boolean(errorMessage)}
    class:validation-toast={issues.length > 0}
    class:expanded={detailsOpen}
    role={errorMessage ? 'alert' : 'status'}
  >
    <div class="toast-summary">
      <p>{errorMessage || statusMessage}</p>
      <div class="toast-actions">
        {#if issues.length > 0}
          <button type="button" on:click={() => dispatch('toggleDetails')}>
            {detailsOpen ? 'Hide details' : `View details (${issues.length})`}
          </button>
        {/if}
        <button type="button" aria-label="Close notification" on:click={() => dispatch('close')}>×</button>
      </div>
    </div>

    {#if detailsOpen}
      <div class="validation-issue-list">
        {#each issues as issue (issue.id)}
          <article>
            <div>
              <strong>{issue.title}</strong>
              {#if issue.nodeId}
                <code>{issue.nodeId}</code>
              {/if}
            </div>
            <p>{issue.message}</p>
            <small><strong>How to fix:</strong> {issue.fix}</small>
            <button type="button" on:click={() => dispatch('focusIssue', { issue })}>
              {issue.nodeId ? 'View node' : 'Open settings'}
            </button>
          </article>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .toast-message {
    position: absolute;
    right: 18px;
    bottom: 18px;
    z-index: 120;
    width: min(460px, calc(100% - 36px));
    padding: 14px;
    color: #dfffea;
    background: #071810f2;
    border: 1px solid #55f09a;
    border-radius: 6px;
    box-shadow: 0 12px 40px #00000099;

    &.error {
      color: #ffe7e7;
      background: #210c0df2;
      border-color: #ef5b67;
    }

    &.expanded {
      max-height: min(70vh, 620px);
      overflow-y: auto;
    }
  }

  .toast-summary {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;

    p {
      margin: 0;
      line-height: 1.5;
    }
  }

  .toast-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 7px;

    button {
      min-height: 32px;
      padding: 5px 9px;
      color: inherit;
      background: #0d1825;
      border: 1px solid currentColor;
      border-radius: 4px;
      font: inherit;
      cursor: pointer;
    }
  }

  .validation-issue-list {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #ffffff22;
    display: grid;
    gap: 10px;

    article {
      padding: 12px;
      background: #050b12aa;
      border-left: 3px solid #ef5b67;

      > div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      p,
      small {
        display: block;
        margin: 7px 0;
        line-height: 1.5;
      }

      code {
        color: #91a7c0;
        font-size: 0.66rem;
      }

      button {
        min-height: 34px;
        padding: 6px 10px;
        color: #ffffff;
        background: #182638;
        border: 1px solid #617893;
        border-radius: 4px;
        cursor: pointer;
      }
    }
  }
</style>
