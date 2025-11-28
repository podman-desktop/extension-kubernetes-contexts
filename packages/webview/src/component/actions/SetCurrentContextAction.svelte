<script lang="ts">
import { faRightToBracket } from '@fortawesome/free-solid-svg-icons';
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

async function setCurrentContext(name: string): Promise<void> {
  await contextsApi.setCurrentContext(name);
}
</script>

<IconButton title="Set as Current Context" icon={faRightToBracket} onClick={(): Promise => setCurrentContext(name)} />
