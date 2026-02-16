<script lang="ts">
import { Checkbox } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';

import ContextCardLine from '/@/component/ContextCardLine.svelte';
import { kubernetesIconBase64 } from '/@/component/KubeIcon';
import { getContext, onMount } from 'svelte';
import { States } from '/@/state/states';
import { KEEP_BOTH, REPLACE, type Props } from '/@/component/ImportContextCard';

let {
  name,
  cluster,
  user,
  server,
  namespace,
  selected = $bindable(),
  hasConflict,
  conflictResolution,
  onConflictResolutionChange,
}: Props = $props();

const states = getContext<States>(States);
const availableContexts = states.stateAvailableContextsInfoUI;

onMount(() => {
  return availableContexts.subscribe();
});

function generatePreviewName(name: string): string {
  const existingNames = availableContexts.data?.contexts.map(ctx => ctx.name);

  if (!existingNames) {
    return name;
  }

  let counter = 1;
  let newName: string;
  for (;;) {
    newName = `${name}-${counter}`;
    if (!existingNames.includes(newName)) {
      break;
    }
    counter += 1;
  }
  return newName;
}
</script>

<div role="row" aria-label={name} class="bg-(--pd-content-card-bg) rounded-md p-3 flex">
  <!-- Checkbox stays at full opacity -->
  <div class="flex items-start pr-3 pt-1">
    <Checkbox bind:checked={selected} title="Select context {name}" />
  </div>

  <!-- Card content fades when deselected -->
  <div class="grow" class:opacity-50={!selected}>
    <div class="flex items-center pb-2">
      <Icon icon={kubernetesIconBase64} class="max-w-[40px] h-full" />

      <div class="pl-3 grow flex flex-col justify-center">
        <span class="font-semibold text-(--pd-invert-content-card-header-text)" aria-label="Context Name">
          {name}
        </span>
      </div>
    </div>

    <!-- Conflict resolution options -->
    {#if hasConflict && selected}
      <div class="flex flex-wrap items-center mb-3 gap-3 p-2 bg-(--pd-invert-content-bg) rounded">
        <span class="text-amber-500 text-sm">⚠ A context with this name already exists</span>

        <label class="flex items-center cursor-pointer" aria-label="keep-both-radio">
          <input
            type="radio"
            name="conflictResolution-{name}"
            value={KEEP_BOTH}
            checked={conflictResolution === KEEP_BOTH}
            onchange={(): void => onConflictResolutionChange(KEEP_BOTH)}
            class="sr-only peer"
            aria-label="keep-both-conflict-resolution-select" />
          <div
            class="w-4 h-4 rounded-full border-2 border-(--pd-input-checkbox-unchecked) mr-2 peer-checked:border-(--pd-input-checkbox-checked) peer-checked:bg-(--pd-input-checkbox-checked)">
          </div>
          <span class="text-sm">Keep both</span>
          <span class="ml-1 text-xs text-(--pd-content-text)">
            → <span class="font-mono bg-(--pd-invert-content-bg) px-1 rounded">{generatePreviewName(name)}</span>
          </span>
        </label>

        <label class="flex items-center cursor-pointer" aria-label="replace-radio">
          <input
            type="radio"
            name="conflictResolution-{name}"
            value={REPLACE}
            checked={conflictResolution === REPLACE}
            onchange={(): void => onConflictResolutionChange(REPLACE)}
            class="sr-only peer"
            aria-label="replace-conflict-resolution-select" />
          <div
            class="w-4 h-4 rounded-full border-2 border-(--pd-input-checkbox-unchecked) mr-2 peer-checked:border-(--pd-input-checkbox-checked) peer-checked:bg-(--pd-input-checkbox-checked)">
          </div>
          <span class="text-sm">Replace existing</span>
        </label>
      </div>
    {/if}

    <!-- Context details -->
    <div class="grow text-sm">
      <ContextCardLine title="CLUSTER" value={cluster} label="Context Cluster" />
      {#if server}
        <ContextCardLine title="SERVER" value={server} label="Context Server" />
      {/if}
      <ContextCardLine title="USER" value={user} label="Context User" />
      {#if namespace}
        <ContextCardLine title="NAMESPACE" value={namespace} label="Context Namespace" />
      {/if}
    </div>
  </div>
</div>
