<script lang="ts">
  import { onMount } from 'svelte';
  import { favoriteKey } from '../../../lib/favorites';
  import { call } from '../../../lib/messages';
  import { t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';

  let {
    kind,
    service,
    creatorId,
    postId = null,
    title,
  }: {
    kind: 'post' | 'creator';
    service: string;
    creatorId: string;
    postId?: string | null;
    title: string;
  } = $props();

  let on = $state(false);

  onMount(async () => {
    const key = favoriteKey(kind, service, creatorId, postId);
    on = (await call('favorites:list').catch(() => [])).some((f) => f.key === key);
  });

  async function toggle() {
    const result = await call('favorites:toggle', {
      favorite: { kind, service, creatorId, postId, title },
    }).catch(() => null);
    if (!result) return;
    on = result.favorite;
    toast(on ? t('favorites.added') : t('favorites.removed'), on ? 'success' : 'info');
  }
</script>

<IconButton
  icon="star"
  active={on}
  label={on ? t('favorites.remove') : t('favorites.add')}
  tipSide="left"
  onclick={toggle}
/>
