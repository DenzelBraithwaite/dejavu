<script lang="ts">

  export let btnType: 'terminal-option' = 'terminal-option';
  export let disabled = false;
</script>

<button on:click class="btn {btnType}" {disabled}>
  <slot></slot>
</button>

<style lang="scss">
  button {
    cursor: pointer;
    outline: none;
    border: none;
    font-size: 1.5rem;
    padding: 0.5rem 1rem;

  }

  .terminal-option {
    width: 100%;
    border: 2px solid var(--white);
    color: var(--white);
    background: none;
    font-weight: bold;
    text-align: center;
    border-radius: var(--border-radius-small);
    transition: all 0.3s ease-out;

    &:hover {
      border: 2px solid var(--slate-900);
      color: var(--slate-900);
      background-color: var(--white);
      border-style: double;
      border-width: 4px;
    }
  }

  .page-menu-btn__green {
    color: #5bc955;
    background-color: #115a0e;
    border-radius: var(--border-radius-small);
    transition: all 0.2s ease-out;
    padding: 0.5rem 1rem;
    
    &:hover {
      background-color: #5bc955;
      color: #115a0e;
      padding: 0.4rem 0.9rem;
    }
  }
</style>