<script lang="ts">
  // Components
  import { Client } from './lib/components/index';

</script>

<main class="main-content">
  <Client />
</main>

<style lang="scss">
  .main-content {
    width: 100%;
    height: 100vh;
    height: 100dvh;
    padding: 8px;
    background-color: var(--black);

    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  @media (max-width: 760px) {
    .main-content {
      padding: 0;
    }
  }
</style>
