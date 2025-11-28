<script lang="ts">
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import IconButton from '/@/component/button/IconButton.svelte';
import { Remote } from '/@/remote/remote';
import { getContext } from 'svelte';
import { API_CONTEXTS } from '@kubernetes-contexts/channels';

interface Props {
  name: string;
}
const { name }: Props = $props();

const remote = getContext<Remote>(Remote);
const contextsApi = remote.getProxy(API_CONTEXTS);

async function deleteContext(name: string): Promise<void> {
  await contextsApi.deleteContext(name);
}
</script>

<IconButton title="Delete Context" icon={faTrash} onClick={(): Promise => deleteContext(name)} />
